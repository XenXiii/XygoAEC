import crypto from "node:crypto";

// Tenant-safe onboarding + audit-intent state machine.
//
// The homepage objective is submitted before authentication and must survive
// the trip through identity and every onboarding step. Each state names the
// step Xygo is currently waiting on; `objective_submitted` is the pre-auth
// entry point and `workspace_ready` is terminal.
//
//   objective_submitted
//     -> profile_pending
//     -> business_pending
//     -> plan_pending
//     -> connections_pending_or_skipped
//     -> audit_queued
//     -> audit_running
//     -> audit_completed
//     -> workspace_ready
//
// Transitions are idempotent (replaying an event id is a no-op) and cannot be
// bypassed (an event only applies from its exact `from` state). Nothing here
// grants entitlement — plan choice is a preference, and no secret material is
// ever stored on the journey.

export const JOURNEY_STATES = Object.freeze([
  "objective_submitted",
  "profile_pending",
  "business_pending",
  "plan_pending",
  "connections_pending_or_skipped",
  "audit_queued",
  "audit_running",
  "audit_completed",
  "workspace_ready"
]);

export const AUTH_PROVIDERS = Object.freeze(["google", "microsoft", "yahoo", "apple", "password"]);
export const PLAN_CODES = Object.freeze(["basic", "premium", "business"]);
export const CONNECTION_PROVIDERS = Object.freeze([
  "gmail", "outlook", "yahoo",
  "quickbooks", "xero",
  "stripe", "square", "paypal",
  "hubspot", "salesforce", "shopify",
  "google_analytics", "google_search_console", "google_ads", "meta_ads",
  "google_sheets", "excel", "csv"
]);

const STATE_INDEX = new Map(JOURNEY_STATES.map((state, index) => [state, index]));
const clone = (value) => structuredClone(value);
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const fail = (message, status = 400, extra = {}) => {
  throw Object.assign(new Error(message), { status, ...extra });
};

function required(value, label) {
  if (typeof value !== "string" || value.trim() === "") fail(`${label} is required.`);
  return value.trim();
}

// Strip markup and reject the classic prompt-injection lead-ins so untrusted
// free text (objective, business notes) cannot smuggle instructions downstream.
function safeText(value, label, { max = 2000 } = {}) {
  const clean = required(value, label).replace(/<[^>]*>/g, "").slice(0, max);
  if (/ignore (all|previous) instructions|system prompt|developer message/i.test(clean)) {
    fail(`${label} contains an untrusted instruction pattern.`, 400, { code: "prompt_injection_rejected" });
  }
  return clean;
}

// Websites are the one place a client hands us a URL; only http(s) is allowed so
// a javascript:/data: payload can never be persisted or later fetched.
function safeUrl(value, label) {
  const raw = required(value, label);
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${label} must be a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") fail(`${label} must use http or https.`);
  return url.toString();
}

function normalizedEmail(value) {
  const email = required(value, "Business email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Business email is invalid.");
  return email;
}

// Validators return only the data we are allowed to persist. Passwords and any
// secret-like fields are intentionally dropped here, never stored.
const STEP_VALIDATORS = {
  profile(input = {}) {
    if (!AUTH_PROVIDERS.includes(input.provider)) fail(`Unsupported authentication provider: ${input.provider}`);
    const profile = { fullName: required(input.fullName, "Full name"), provider: input.provider };
    if (input.provider === "password") profile.email = normalizedEmail(input.email);
    else if (input.email != null) profile.email = normalizedEmail(input.email);
    return profile;
  },
  business(input = {}) {
    const business = {
      businessName: required(input.businessName, "Business name"),
      industry: input.industry != null ? safeText(input.industry, "Industry", { max: 120 }) : null,
      location: input.location != null ? safeText(input.location, "Location", { max: 200 }) : null,
      website: input.website != null && input.website !== "" ? safeUrl(input.website, "Website") : null,
      primaryObjective: input.primaryObjective != null ? safeText(input.primaryObjective, "Primary objective") : null
    };
    return business;
  },
  plan(input = {}) {
    if (!PLAN_CODES.includes(input.plan)) fail(`Unknown plan: ${input.plan}`);
    // A preference only — entitlement is decided elsewhere by verified billing state.
    return { plan: input.plan, entitlement: "none" };
  },
  connections(input = {}) {
    if (input.skipped === true) return { skipped: true, providers: [] };
    const providers = Array.isArray(input.providers) ? input.providers : [];
    for (const provider of providers) {
      if (!CONNECTION_PROVIDERS.includes(provider)) fail(`Unsupported connection provider: ${provider}`);
    }
    if (input.token != null || input.credentials != null || input.secret != null) {
      fail("Connection secrets must never be sent to the onboarding journey.", 400, { code: "secret_rejected" });
    }
    return { skipped: false, providers: [...new Set(providers)] };
  }
};

// (from state, event) -> { to, step? }. A `step` runs its validator and records
// the collected data under that key.
const TRANSITIONS = {
  objective_submitted: { beginOnboarding: { to: "profile_pending" } },
  profile_pending: { completeProfile: { to: "business_pending", step: "profile" } },
  business_pending: { completeBusiness: { to: "plan_pending", step: "business" } },
  plan_pending: { selectPlan: { to: "connections_pending_or_skipped", step: "plan" } },
  connections_pending_or_skipped: { completeConnections: { to: "audit_queued", step: "connections" } },
  audit_queued: { startAuditRun: { to: "audit_running" } },
  audit_running: { completeAuditRun: { to: "audit_completed" } },
  audit_completed: { openWorkspace: { to: "workspace_ready" } }
};

export function createJourney({ objective, ownerUserId = null, now = new Date().toISOString() }) {
  return {
    id: id("journey"),
    state: "objective_submitted",
    objective: safeText(objective, "Objective"),
    ownerUserId,
    workspaceId: null,
    profile: null,
    business: null,
    plan: null,
    connections: null,
    auditRef: null,
    appliedEvents: [],
    createdAt: now,
    updatedAt: now
  };
}

// Apply one transition. Pure: returns a new journey, never mutates the input.
// `eventId` makes the transition idempotent; replaying a seen id is a no-op.
export function advance(journey, event, payload = {}, { eventId = null, now = new Date().toISOString() } = {}) {
  if (!journey || !STATE_INDEX.has(journey.state)) fail("Journey is invalid.", 500);
  if (eventId && journey.appliedEvents.includes(eventId)) return clone(journey);

  const allowed = TRANSITIONS[journey.state] ?? {};
  const transition = allowed[event];
  if (!transition) {
    // Distinguish "already moved past this" (idempotent replay without an id)
    // from a genuine out-of-order / bypass attempt.
    const target = Object.values(TRANSITIONS).flatMap((t) => Object.entries(t))
      .find(([name]) => name === event)?.[1];
    if (target && STATE_INDEX.get(journey.state) >= STATE_INDEX.get(target.to)) return clone(journey);
    fail(`Event "${event}" is not allowed from state "${journey.state}".`, 409, { code: "invalid_transition" });
  }

  const next = clone(journey);
  if (transition.step) next[transition.step] = STEP_VALIDATORS[transition.step](payload);
  if (event === "beginOnboarding") {
    // Bind the anonymously-submitted objective to the authenticated tenant.
    if (payload.workspaceId) next.workspaceId = payload.workspaceId;
    if (payload.ownerUserId) next.ownerUserId = payload.ownerUserId;
  }
  if (event === "completeConnections") {
    // Seed exactly one durable audit job, carrying the original objective.
    next.auditRef = journey.auditRef ?? id("audit");
  }
  next.state = transition.to;
  if (eventId) next.appliedEvents = [...journey.appliedEvents, eventId];
  next.updatedAt = now;
  return next;
}

export function isComplete(journey) {
  return journey?.state === "workspace_ready";
}

// A safe projection for the client to resume from — never leaks internal ids
// beyond what the UI needs, and never carries secret material (there is none).
export function projectJourney(journey) {
  return {
    id: journey.id,
    state: journey.state,
    objective: journey.objective,
    workspaceId: journey.workspaceId,
    profile: journey.profile,
    business: journey.business,
    plan: journey.plan,
    connections: journey.connections,
    auditRef: journey.auditRef,
    complete: isComplete(journey),
    updatedAt: journey.updatedAt
  };
}

// In-memory repository mirroring the audit-platform adapter shape.
export function createOnboardingRepository(seed = {}) {
  const journeys = new Map((seed.journeys ?? []).map((j) => [j.id, clone(j)]));
  return {
    save(journey) { journeys.set(journey.id, clone(journey)); return clone(journey); },
    get(journeyId) { return clone(journeys.get(journeyId) ?? null); }
  };
}

// Service layer: enforces identity and ownership around the pure machine.
export function createOnboardingService({ repository, now = () => new Date().toISOString() }) {
  const requireAuth = (principal) => {
    if (!principal?.authenticated || !principal.userId) fail("Authentication required.", 401);
    return principal.userId;
  };
  const load = (principal, journeyId) => {
    const userId = requireAuth(principal);
    const journey = repository.get(journeyId);
    if (!journey) fail("Journey not found.", 404);
    // Once bound to an owner, only that owner may read or advance it.
    if (journey.ownerUserId && journey.ownerUserId !== userId) fail("Journey access denied.", 403);
    return journey;
  };
  return {
    // Objective is captured before/at authentication; owner is bound if known.
    start(principal, input) {
      const ownerUserId = principal?.authenticated ? principal.userId : null;
      const journey = createJourney({ objective: input.objective, ownerUserId, now: now() });
      return projectJourney(repository.save(journey));
    },
    get(principal, journeyId) {
      return projectJourney(load(principal, journeyId));
    },
    advance(principal, journeyId, event, payload = {}, options = {}) {
      const journey = load(principal, journeyId);
      // `beginOnboarding` is the point identity is bound; require it here.
      if (event === "beginOnboarding") {
        const userId = requireAuth(principal);
        payload = { ...payload, ownerUserId: journey.ownerUserId ?? userId };
      }
      const next = advance(journey, event, payload, { eventId: options.eventId, now: now() });
      return projectJourney(repository.save(next));
    }
  };
}
