import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Webhook } from "svix";

import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";

export const EMAIL_DELIVERY_KINDS = Object.freeze([
  "activation",
  "report_ready",
  "portal_update"
]);
export const EMAIL_DELIVERY_STATUSES = Object.freeze([
  "queued",
  "sending",
  "accepted",
  "delivered",
  "delayed",
  "failed",
  "bounced",
  "complained",
  "suppressed"
]);

const KIND_SET = new Set(EMAIL_DELIVERY_KINDS);
const STATUS_SET = new Set(EMAIL_DELIVERY_STATUSES);
const TERMINAL_STATUSES = new Set(["delivered", "bounced", "complained", "suppressed"]);
const WEBHOOK_STATUS = Object.freeze({
  "email.sent": "accepted",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.failed": "failed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.suppressed": "suppressed"
});

function requiredString(value, label, maximum = 2000) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  const normalized = value.trim();
  if (normalized.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} is invalid or too long.`);
  }
  return normalized;
}

function singleLineString(value, label, maximum = 2000) {
  const normalized = requiredString(value, label, maximum);
  if (/[\r\n]/.test(normalized)) throw new Error(`${label} must be a single line.`);
  return normalized;
}

function emailAddress(value, label = "Email address") {
  const normalized = requiredString(value, label, 320).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function httpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(requiredString(value, label, 2048));
  } catch {
    throw new Error(`${label} must be an absolute HTTP or HTTPS URL.`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} must be an HTTP or HTTPS URL without credentials or a fragment.`);
  }
  return parsed.toString();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}

export function renderEmailTemplate(kind, input = {}) {
  if (!KIND_SET.has(kind)) throw new Error(`Unknown email delivery kind: ${kind}`);
  const recipientName = requiredString(input.recipientName ?? "there", "Recipient name", 200);
  const actionUrl = httpUrl(input.actionUrl, "Email actionUrl");
  let subject;
  let heading;
  let summary;

  if (kind === "activation") {
    const workspaceName = singleLineString(input.workspaceName, "Workspace name", 200);
    subject = `${workspaceName} access is ready`;
    heading = `Welcome to ${workspaceName}`;
    summary = "Your managed sign-in has been connected. Use the secure link below to open your workspace.";
  } else if (kind === "report_ready") {
    const reportTitle = singleLineString(input.reportTitle, "Report title", 200);
    subject = `Report ready: ${reportTitle}`;
    heading = reportTitle;
    summary = "An approved report is available in your client portal.";
  } else {
    const projectName = singleLineString(input.projectName, "Project name", 200);
    subject = `Project update: ${projectName}`;
    heading = projectName;
    summary = requiredString(input.updateSummary, "Update summary", 1000);
  }

  const text = `Hello ${recipientName},\n\n${summary}\n\nOpen Xygo: ${actionUrl}\n\nThis is an automated operational message.`;
  const html = [
    `<p>Hello ${escapeHtml(recipientName)},</p>`,
    `<h1>${escapeHtml(heading)}</h1>`,
    `<p>${escapeHtml(summary)}</p>`,
    `<p><a href="${escapeHtml(actionUrl)}">Open Xygo</a></p>`,
    "<p>This is an automated operational message.</p>"
  ].join("");
  return { subject, text, html, actionUrl };
}

export function createEmailDelivery(input, { id = crypto.randomUUID(), now = new Date() } = {}) {
  const tenantId = requiredString(input?.tenantId, "Email delivery tenantId", 200);
  const kind = requiredString(input?.kind, "Email delivery kind", 100);
  if (!KIND_SET.has(kind)) throw new Error(`Unknown email delivery kind: ${kind}`);
  const recipientEmail = emailAddress(input.recipientEmail, "Recipient email");
  const message = renderEmailTemplate(kind, input.templateData);
  const createdAt = now.toISOString();
  const deliveryId = requiredString(id, "Email delivery id", 200);
  const idempotencyKey = singleLineString(
    input.idempotencyKey ?? `${tenantId}:email:${kind}:${deliveryId}`,
    "Email delivery idempotency key",
    256
  );
  return {
    id: deliveryId,
    tenantId,
    recipientUserId: input.recipientUserId ? requiredString(input.recipientUserId, "Recipient user id", 200) : null,
    recipientEmail,
    kind,
    resourceType: input.resourceType ? requiredString(input.resourceType, "Resource type", 100) : null,
    resourceId: input.resourceId ? requiredString(input.resourceId, "Resource id", 200) : null,
    idempotencyKey,
    status: "queued",
    attempts: 0,
    provider: null,
    providerMessageId: null,
    providerStatusAt: null,
    lastError: null,
    message,
    createdAt,
    updatedAt: createdAt,
    acceptedAt: null,
    deliveredAt: null,
    staged: true
  };
}

export function createEmailDeliveryOutboxEvent(delivery) {
  assertEmailDelivery(delivery);
  return createOutboxEvent({
    id: `${delivery.id}-outbox`,
    eventType: "email.delivery.requested",
    aggregateType: "email_delivery",
    aggregateId: delivery.id,
    tenantId: delivery.tenantId,
    occurredAt: delivery.createdAt,
    payload: { deliveryId: delivery.id, kind: delivery.kind }
  });
}

export function createEmailDeliveryAuditEvent(delivery, {
  action,
  actorId = "email-worker",
  previousHash = null,
  signingKey = null,
  timestamp = new Date().toISOString(),
  suffix = action
} = {}) {
  assertEmailDelivery(delivery);
  return createAuditEvent({
    eventId: `${delivery.id}-${suffix}-audit`,
    tenantId: delivery.tenantId,
    actorType: "system",
    actorId,
    action,
    resourceType: "email_delivery",
    resourceId: delivery.id,
    afterStateRef: delivery.status,
    correlationId: delivery.id,
    requestId: delivery.id,
    timestamp,
    previousHash,
    signingKey
  });
}

export async function queueEmailDelivery({
  repository,
  outbox,
  delivery,
  actorId = "email-queue",
  auditSigningKey = null
}) {
  assertEmailDelivery(delivery);
  let result;
  const persist = async () => {
    result = await repository.createEmailDelivery(delivery);
    if (!result.created) return;
    const events = await repository.listAuditEventsByTenant(delivery.tenantId);
    const auditEvent = createEmailDeliveryAuditEvent(delivery, {
      action: "email.delivery.queued",
      actorId,
      previousHash: events.at(-1)?.eventHash ?? null,
      signingKey: auditSigningKey,
      timestamp: delivery.createdAt,
      suffix: "queued"
    });
    await repository.appendAuditEvent(auditEvent);
    const outboxEvent = createEmailDeliveryOutboxEvent(delivery);
    if (repository.supportsTransactionalOutbox) {
      await repository.enqueueOutboxEvent(outboxEvent, { idempotencyKey: delivery.idempotencyKey });
    } else {
      if (!outbox) throw new Error("An outbox store is required for a non-transactional repository.");
      await outbox.enqueue(outboxEvent, { idempotencyKey: delivery.idempotencyKey });
    }
  };
  if (repository.supportsTransactionalOutbox) await repository.runTransaction(persist);
  else await persist();
  return result;
}

export function assertEmailDelivery(delivery) {
  requiredString(delivery?.id, "Email delivery id", 200);
  requiredString(delivery?.tenantId, "Email delivery tenantId", 200);
  emailAddress(delivery?.recipientEmail, "Recipient email");
  if (!KIND_SET.has(delivery.kind)) throw new Error("Email delivery kind is invalid.");
  if (!STATUS_SET.has(delivery.status)) throw new Error("Email delivery status is invalid.");
  requiredString(delivery?.idempotencyKey, "Email delivery idempotency key", 256);
  return delivery;
}

export function emailDeliveryIntentMatches(left, right) {
  return Boolean(left && right &&
    left.id === right.id &&
    left.tenantId === right.tenantId &&
    (left.recipientUserId ?? null) === (right.recipientUserId ?? null) &&
    left.recipientEmail === right.recipientEmail &&
    left.kind === right.kind &&
    (left.resourceType ?? null) === (right.resourceType ?? null) &&
    (left.resourceId ?? null) === (right.resourceId ?? null) &&
    left.idempotencyKey === right.idempotencyKey &&
    JSON.stringify(left.message) === JSON.stringify(right.message));
}

export function markEmailDeliverySending(delivery, { attempt, now = new Date() }) {
  assertEmailDelivery(delivery);
  if (TERMINAL_STATUSES.has(delivery.status)) return delivery;
  return {
    ...delivery,
    status: "sending",
    attempts: Math.max(delivery.attempts ?? 0, Number(attempt) || 1),
    lastError: null,
    updatedAt: now.toISOString()
  };
}

export function markEmailDeliveryAccepted(delivery, { provider, providerMessageId, now = new Date() }) {
  assertEmailDelivery(delivery);
  if (TERMINAL_STATUSES.has(delivery.status)) return delivery;
  const timestamp = now.toISOString();
  return {
    ...delivery,
    status: "accepted",
    provider: requiredString(provider, "Email provider", 100),
    providerMessageId: requiredString(providerMessageId, "Provider message id", 200),
    providerStatusAt: timestamp,
    lastError: null,
    acceptedAt: delivery.acceptedAt ?? timestamp,
    updatedAt: timestamp
  };
}

export function markEmailDeliveryFailed(delivery, error, { attempt, now = new Date() } = {}) {
  assertEmailDelivery(delivery);
  if (TERMINAL_STATUSES.has(delivery.status)) return delivery;
  return {
    ...delivery,
    status: "failed",
    attempts: Math.max(delivery.attempts ?? 0, Number(attempt) || 1),
    lastError: String(error?.message ?? error).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 2000),
    updatedAt: now.toISOString()
  };
}

export function applyEmailWebhookStatus(delivery, event) {
  assertEmailDelivery(delivery);
  const status = WEBHOOK_STATUS[event?.type];
  if (!status) return delivery;
  if (event?.data?.email_id !== delivery.providerMessageId) throw new Error("Email webhook provider message does not match delivery.");
  const occurredAt = new Date(requiredString(event.created_at, "Webhook created_at", 100));
  if (Number.isNaN(occurredAt.getTime())) throw new Error("Webhook created_at is invalid.");
  const currentAt = delivery.providerStatusAt ? new Date(delivery.providerStatusAt) : null;
  if (currentAt && occurredAt < currentAt) return delivery;
  const timestamp = occurredAt.toISOString();
  return {
    ...delivery,
    status,
    providerStatusAt: timestamp,
    deliveredAt: status === "delivered" ? timestamp : delivery.deliveredAt,
    lastError: ["failed", "bounced", "complained", "suppressed"].includes(status)
      ? String(event.data?.bounce?.message ?? event.type).slice(0, 2000)
      : delivery.lastError,
    updatedAt: timestamp
  };
}

function sinkState(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeSink(filePath, items) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(items, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

export function createLocalEmailSink({ filePath = null } = {}) {
  const memory = sinkState(filePath);
  return {
    provider: "sink",
    async send(delivery, { idempotencyKey = delivery.idempotencyKey } = {}) {
      assertEmailDelivery(delivery);
      const existing = memory.find((item) => item.idempotencyKey === idempotencyKey);
      if (existing) {
        if (!emailDeliveryIntentMatches(existing.delivery, delivery)) {
          const error = new Error("Email sink idempotency key is bound to a different delivery.");
          error.code = "email_idempotency_conflict";
          error.retryable = false;
          throw error;
        }
        return { id: existing.providerMessageId, duplicate: true };
      }
      const providerMessageId = `sink-${crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24)}`;
      memory.push({ providerMessageId, idempotencyKey, delivery: structuredClone(delivery), acceptedAt: new Date().toISOString() });
      writeSink(filePath, memory);
      return { id: providerMessageId, duplicate: false };
    },
    async checkReadiness() {
      if (filePath) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.accessSync(path.dirname(filePath), fs.constants.R_OK | fs.constants.W_OK);
      }
      return { ready: true, provider: "sink", stored: memory.length };
    },
    all() {
      return structuredClone(memory);
    },
    async close() {}
  };
}

export function createResendEmailProvider(configuration, { fetchImpl = fetch } = {}) {
  const endpoint = new URL("emails", configuration.apiUrl.endsWith("/") ? configuration.apiUrl : `${configuration.apiUrl}/`);
  return {
    provider: "resend",
    async send(delivery, { idempotencyKey = delivery.idempotencyKey } = {}) {
      assertEmailDelivery(delivery);
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${configuration.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey
        },
        body: JSON.stringify({
          from: configuration.from,
          to: [delivery.recipientEmail],
          subject: delivery.message.subject,
          text: delivery.message.text,
          html: delivery.message.html,
          ...(configuration.replyTo ? { reply_to: configuration.replyTo } : {}),
          tags: [
            { name: "tenant", value: crypto.createHash("sha256").update(delivery.tenantId).digest("hex").slice(0, 24) },
            { name: "kind", value: delivery.kind }
          ]
        }),
        signal: AbortSignal.timeout(configuration.requestTimeoutMs)
      });
      let payload = {};
      try { payload = await response.json(); } catch {}
      if (!response.ok || !payload?.id) {
        const error = new Error(`Resend delivery failed with HTTP ${response.status}: ${payload?.message ?? "provider error"}`);
        error.code = payload?.name ?? `email_provider_http_${response.status}`;
        error.retryable = response.status === 409 ? payload?.name === "concurrent_idempotent_requests" : response.status === 429 || response.status >= 500;
        throw error;
      }
      return { id: payload.id, duplicate: false };
    },
    async checkReadiness() {
      return { ready: true, provider: "resend", configured: true };
    },
    async close() {}
  };
}

export function emailConfigurationFromEnvironment(env = {}) {
  const transport = String(env.XYGO_EMAIL_TRANSPORT ?? "sink").trim().toLowerCase();
  if (transport === "sink") {
    return {
      transport,
      sinkPath: path.resolve(env.XYGO_EMAIL_SINK_PATH ?? "infrastructure/staged-data/email-sink.json")
    };
  }
  if (transport !== "resend") throw new Error("XYGO_EMAIL_TRANSPORT must be sink or resend.");
  if (String(env.STAGED_MODE ?? "true").toLowerCase() !== "false") {
    throw new Error("Resend email transport requires STAGED_MODE=false; staged/local mode must use the sink.");
  }
  const apiUrl = httpUrl(env.XYGO_EMAIL_RESEND_API_URL, "XYGO_EMAIL_RESEND_API_URL");
  return {
    transport,
    apiUrl,
    apiKey: requiredString(env.XYGO_EMAIL_RESEND_API_KEY, "XYGO_EMAIL_RESEND_API_KEY", 500),
    webhookSecret: requiredString(env.XYGO_EMAIL_WEBHOOK_SECRET, "XYGO_EMAIL_WEBHOOK_SECRET", 500),
    from: requiredString(env.XYGO_EMAIL_FROM, "XYGO_EMAIL_FROM", 320),
    replyTo: env.XYGO_EMAIL_REPLY_TO ? emailAddress(env.XYGO_EMAIL_REPLY_TO, "XYGO_EMAIL_REPLY_TO") : null,
    requestTimeoutMs: integerSetting(env.XYGO_EMAIL_REQUEST_TIMEOUT_MS, 10_000, 1_000, 30_000)
  };
}

function integerSetting(value, defaultValue, minimum, maximum) {
  const raw = value === undefined || value === null || value === "" ? String(defaultValue) : String(value);
  const parsed = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Email request timeout must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function createEmailProviderFromEnv(env = process.env, options = {}) {
  const configuration = emailConfigurationFromEnvironment(env);
  return configuration.transport === "sink"
    ? createLocalEmailSink({ filePath: configuration.sinkPath })
    : createResendEmailProvider(configuration, options);
}

export function verifyResendWebhook({ rawBody, headers, webhookSecret, now = new Date() }) {
  if (typeof rawBody !== "string" || rawBody.length === 0 || rawBody.length > 256 * 1024) {
    throw new Error("Email webhook body must be a non-empty string no larger than 262144 characters.");
  }
  // Signature verification must receive the exact bytes sent by the provider.
  // Trimming or reserializing JSON here would invalidate legitimate signatures.
  const payload = rawBody;
  const id = requiredString(headers?.["svix-id"], "svix-id", 200);
  const timestamp = requiredString(headers?.["svix-timestamp"], "svix-timestamp", 100);
  const signature = requiredString(headers?.["svix-signature"], "svix-signature", 1000);
  const eventTime = Number(timestamp) * 1000;
  if (!Number.isFinite(eventTime) || Math.abs(now.getTime() - eventTime) > 5 * 60_000) {
    throw new Error("Email webhook timestamp is outside the allowed replay window.");
  }
  const event = new Webhook(requiredString(webhookSecret, "Email webhook secret", 500)).verify(payload, {
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": signature
  });
  return { id, event };
}

export function emailWebhookStatus(eventType) {
  return WEBHOOK_STATUS[eventType] ?? null;
}

export function summarizeEmailDeliveryHealth(deliveries, {
  now = Date.now(),
  staleAfterMs = 15 * 60_000,
  maxFailed = 0,
  requireHealthy = false
} = {}) {
  const counts = Object.fromEntries(EMAIL_DELIVERY_STATUSES.map((status) => [status, 0]));
  let stale = 0;
  for (const delivery of deliveries) {
    assertEmailDelivery(delivery);
    counts[delivery.status] += 1;
    if (["queued", "sending", "delayed", "failed"].includes(delivery.status)) {
      const updatedAt = new Date(delivery.updatedAt).getTime();
      if (!Number.isFinite(updatedAt) || updatedAt <= now - staleAfterMs) stale += 1;
    }
  }
  const failures = counts.failed + counts.bounced + counts.complained + counts.suppressed;
  const health = {
    ready: stale === 0 && failures <= maxFailed,
    counts,
    failures,
    stale,
    backlog: counts.queued + counts.sending + counts.delayed + counts.failed
  };
  if (requireHealthy && !health.ready) {
    const error = new Error("Email delivery health exceeded configured thresholds.");
    error.code = "email_delivery_unhealthy";
    error.health = health;
    throw error;
  }
  return health;
}

export function summarizeWorkerHeartbeat(heartbeats, {
  now = Date.now(),
  staleAfterMs = 120_000,
  requireHealthy = false
} = {}) {
  const ordered = [...heartbeats]
    .filter((heartbeat) => heartbeat.serviceName === "worker")
    .sort((left, right) => new Date(right.lastSeenAt) - new Date(left.lastSeenAt));
  const active = ordered.find((heartbeat) => {
    const ageMs = Math.max(0, now - new Date(heartbeat.lastSeenAt).getTime());
    return heartbeat.status === "ready" && Number.isFinite(ageMs) && ageMs <= staleAfterMs;
  }) ?? ordered[0] ?? null;
  const ageMs = active ? Math.max(0, now - new Date(active.lastSeenAt).getTime()) : null;
  const ready = Boolean(active && active.status === "ready" && Number.isFinite(ageMs) && ageMs <= staleAfterMs);
  const health = {
    ready,
    instanceId: active?.instanceId ?? null,
    status: active?.status ?? "missing",
    lastSeenAt: active?.lastSeenAt ?? null,
    ageMs
  };
  if (requireHealthy && !ready) {
    const error = new Error("Worker heartbeat is missing, stale, or unhealthy.");
    error.code = "worker_heartbeat_unhealthy";
    error.health = health;
    throw error;
  }
  return health;
}
