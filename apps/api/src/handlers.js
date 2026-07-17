import { buildExecutivePortfolioView, buildTransferQueue } from "../../../packages/dashboards/src/index.js";
import { buildAuditVerificationReport, createAuditEvent, createOutboxEvent } from "../../../packages/audit/src/foundation.js";
import {
  syntheticDrawingSheets,
  syntheticFileRecords,
  syntheticGovernanceEvents,
  syntheticTransferPackages
} from "../../../packages/test-fixtures/src/synthetic-tenants.js";
import { createRepositoryFromEnv } from "./repositories/index.js";
import { canPerform } from "../../../packages/authorization/src/policy.js";
import { resolveStagedPrincipal } from "./auth/principal.js";
import { baseResponseHeaders } from "./http/headers.js";
import { sharedOutbox } from "./reliability/outbox.js";
import { createIdempotencyStore, idempotencyKeyFor } from "./reliability/idempotency.js";

const sharedIdempotency = createIdempotencyStore();

// Replay a cached response for a repeated Idempotency-Key; otherwise compute and
// cache successful (2xx) writes so a client retry does not double-write.
async function withIdempotency({ idempotency, clientKey, tenantId, path, compute }) {
  if (!clientKey) {
    return compute();
  }
  const key = idempotencyKeyFor({ tenantId, path, clientKey });
  const cached = idempotency.get(key);
  if (cached) {
    return cached;
  }
  const result = await compute();
  if (result.status >= 200 && result.status < 300) {
    idempotency.set(key, result);
  }
  return result;
}

const defaultRepository = createRepositoryFromEnv();

// When set (production), audit events are HMAC-signed → tamper-proof. When unset
// (staged), the chain remains tamper-evident only. See docs/security.
const auditSigningKey = process.env.XYGO_AUDIT_SIGNING_KEY ?? null;

function json(status, body) {
  return {
    status,
    headers: baseResponseHeaders({ "content-type": "application/json" }),
    body
  };
}

function badRequest(message = "Bad request.") {
  return json(400, {
    error: "bad_request",
    message,
    staged: true
  });
}

function notFound(message = "Not found.") {
  return json(404, {
    error: "not_found",
    message,
    staged: true
  });
}

function forbidden(message = "Tenant access denied.") {
  return json(403, {
    error: "forbidden",
    message,
    staged: true
  });
}

function parseBody(body) {
  if (!body) {
    return null;
  }

  if (typeof body === "string") {
    return JSON.parse(body);
  }

  return body;
}

function splitPath(pathname) {
  return pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 500;

// Offset pagination + optional status filter for list endpoints. Response gains a
// `pagination` block additively; the default limit covers current dataset sizes so
// existing clients see no change.
function paginate(items, query) {
  const status = query.get("status");
  const filtered = status
    ? items.filter((item) => item.status === status || item.humanDisposition === status)
    : items;

  const rawLimit = Number(query.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_PAGE_LIMIT) : DEFAULT_PAGE_LIMIT;
  const rawOffset = Number(query.get("offset"));
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;

  return {
    items: filtered.slice(offset, offset + limit),
    pagination: {
      total: filtered.length,
      limit,
      offset,
      nextOffset: offset + limit < filtered.length ? offset + limit : null
    }
  };
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function createBlueprintWorkspacePayload({ tenantId, projects, reviewSessions, aiReviewRuns, aiFindings, issues, permits }) {
  const tenantSheetIds = new Set(
    syntheticDrawingSheets.filter((sheet) => sheet.tenantId === tenantId).map((sheet) => sheet.id)
  );

  for (const reviewRun of aiReviewRuns) {
    if (reviewRun.artifactType === "drawing_sheet" && reviewRun.artifactId) {
      tenantSheetIds.add(reviewRun.artifactId);
    }
  }

  for (const reviewSession of reviewSessions) {
    for (const ref of reviewSession.artifactRefs ?? []) {
      if (typeof ref === "string" && ref.startsWith("drawing:")) {
        tenantSheetIds.add(ref.replace("drawing:", ""));
      }
    }
  }

  for (const permitPackage of permits) {
    for (const ref of permitPackage.submissionPackageRefs ?? []) {
      if (typeof ref === "string" && ref.startsWith("drawing:")) {
        tenantSheetIds.add(ref.replace("drawing:", ""));
      }
    }
  }

  // Tenant isolation: a referenced sheet id (from a review run / session / permit)
  // is only included if the sheet ITSELF belongs to this tenant. Without this a
  // cross-tenant artifact reference would leak another tenant's sheets/files.
  const sheets = uniqueById(
    syntheticDrawingSheets.filter((sheet) => tenantSheetIds.has(sheet.id) && sheet.tenantId === tenantId)
  );

  const fileIds = new Set(sheets.map((sheet) => sheet.fileId));
  const files = uniqueById(
    syntheticFileRecords.filter((file) => fileIds.has(file.id) && file.tenantId === tenantId)
  );

  const packages = files.map((file) => {
    const packageSheets = sheets.filter((sheet) => sheet.fileId === file.id);
    const linkedReviewRuns = aiReviewRuns.filter((reviewRun) => packageSheets.some((sheet) => sheet.id === reviewRun.artifactId));
    const linkedFindings = aiFindings.filter((finding) => linkedReviewRuns.some((reviewRun) => reviewRun.id === finding.reviewRunId));

    return {
      id: file.id,
      tenantId,
      projectId: packageSheets[0]?.projectId ?? projects[0]?.id ?? null,
      name: file.originalFilename,
      fileClass: file.fileClass,
      sourceFormat: file.detectedType ?? file.mimeType ?? "pdf",
      status: linkedFindings.some((finding) => finding.humanDisposition === "pending") ? "awaiting_review" : "staged_ready",
      completeness: Math.max(72, 96 - linkedFindings.length * 4),
      sheetCount: packageSheets.length,
      reviewRunIds: linkedReviewRuns.map((reviewRun) => reviewRun.id),
      staged: true
    };
  });

  return {
    tenantId,
    projects,
    packages,
    sheets: sheets.map((sheet) => ({
      ...sheet,
      packageId: sheet.fileId
    })),
    reviewSessions,
    reviewRuns: aiReviewRuns,
    findings: aiFindings,
    issues,
    permits,
    staged: true
  };
}

// Authorization gate: the principal's tenant must match the path tenant, and the
// principal's role must be permitted for (resource, action) by the RBAC matrix.
function authorize({ principal, tenantId, resource, action }) {
  if (!principal?.tenantId || principal.tenantId !== tenantId) {
    return forbidden();
  }

  const decision = canPerform({
    resource,
    action,
    tenantId: principal.tenantId,
    resourceTenantId: tenantId,
    organizationRole: principal.organizationRole,
    projectRole: principal.projectRole
  });

  if (!decision.allowed) {
    return forbidden(`Authorization denied: ${decision.reason}.`);
  }

  return null;
}

async function appendTenantAuditEvent({
  repository,
  tenantId,
  actorId,
  action,
  resourceType,
  resourceId,
  beforeStateRef = null,
  afterStateRef = null
}) {
  const existingEvents = await repository.listAuditEventsByTenant(tenantId);
  const previousHash = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1].eventHash : null;

  const event = createAuditEvent({
    tenantId,
    actorType: "user",
    actorId: actorId ?? "synthetic-user",
    action,
    resourceType,
    resourceId,
    beforeStateRef,
    afterStateRef,
    previousHash,
    signingKey: auditSigningKey
  });

  await repository.appendAuditEvent(event);
}

// Collection resources share one shape: validate body -> tenant/parent guard ->
// create -> append audit event -> 201, and a tenant-scoped list on GET. Declaring
// them in a table keeps that flow in one place instead of seven copies.
const collectionResources = [
  {
    segment: "projects",
    list: (repository, tenantId) => repository.listProjectsByTenant(tenantId),
    validate: (parsed) => (!parsed?.id || !parsed?.name ? "Project id and name are required." : null),
    guard: ({ parsed, tenantId }) =>
      parsed.tenantId && parsed.tenantId !== tenantId ? "Cross-tenant project creation denied." : null,
    build: (parsed, tenantId) => ({
      id: parsed.id,
      tenantId,
      name: parsed.name,
      projectType: parsed.projectType ?? "commercial",
      status: parsed.status ?? "draft"
    }),
    create: (repository, input) => repository.createProject(input),
    audit: {
      action: "api.project.created",
      resourceType: "project",
      afterStateRef: (created) => created.status
    }
  },
  {
    segment: "issues",
    list: (repository, tenantId) => repository.listIssuesByTenant(tenantId),
    validate: (parsed) =>
      !parsed?.id || !parsed?.projectId || !parsed?.title || !parsed?.description
        ? "Issue id, projectId, title, and description are required."
        : null,
    guard: async ({ parsed, tenantId, repository }) => {
      const project = await repository.getProjectById(parsed.projectId);
      return !project || project.tenantId !== tenantId ? "Issue creation requires an in-tenant project." : null;
    },
    build: (parsed, tenantId) => ({
      id: parsed.id,
      tenantId,
      projectId: parsed.projectId,
      title: parsed.title,
      description: parsed.description,
      status: parsed.status ?? "open",
      disciplines: parsed.disciplines ?? ["architecture"],
      severity: parsed.severity ?? "medium",
      priority: parsed.priority ?? "medium"
    }),
    create: (repository, input) => repository.createIssue(input),
    audit: {
      action: "api.issue.created",
      resourceType: "coordination_issue",
      afterStateRef: (created) => created.status
    }
  },
  {
    segment: "rfis",
    list: (repository, tenantId) => repository.listRfisByTenant(tenantId),
    validate: (parsed) =>
      !parsed?.id || !parsed?.projectId || !parsed?.title ? "RFI id, projectId, and title are required." : null,
    guard: async ({ parsed, tenantId, repository }) => {
      const project = await repository.getProjectById(parsed.projectId);
      return !project || project.tenantId !== tenantId ? "RFI creation requires an in-tenant project." : null;
    },
    build: (parsed, tenantId) => ({
      id: parsed.id,
      tenantId,
      projectId: parsed.projectId,
      title: parsed.title,
      question: parsed.question ?? "",
      status: parsed.status ?? "draft",
      relatedIssueIds: parsed.relatedIssueIds ?? [],
      relatedSheetIds: parsed.relatedSheetIds ?? []
    }),
    create: (repository, input) => repository.createRfi(input),
    audit: {
      action: "api.rfi.created",
      resourceType: "rfi",
      afterStateRef: (created) => created.status
    }
  },
  {
    segment: "permits",
    list: (repository, tenantId) => repository.listPermitPackagesByTenant(tenantId),
    validate: (parsed) =>
      !parsed?.id || !parsed?.projectId || !parsed?.jurisdictionProfile
        ? "Permit package id, projectId, and jurisdictionProfile are required."
        : null,
    guard: async ({ parsed, tenantId, repository }) => {
      const project = await repository.getProjectById(parsed.projectId);
      return !project || project.tenantId !== tenantId
        ? "Permit package creation requires an in-tenant project."
        : null;
    },
    build: (parsed, tenantId) => ({
      id: parsed.id,
      tenantId,
      projectId: parsed.projectId,
      jurisdictionProfile: parsed.jurisdictionProfile,
      status: parsed.status ?? "package_preparation",
      submissionPackageRefs: parsed.submissionPackageRefs ?? [],
      requiredFormsChecklist: parsed.requiredFormsChecklist ?? [],
      reviewComments: parsed.reviewComments ?? [],
      responseMatrix: parsed.responseMatrix ?? [],
      permitReadinessFindings: parsed.permitReadinessFindings ?? []
    }),
    create: (repository, input) => repository.createPermitPackage(input),
    audit: {
      action: "api.permit_package.created",
      resourceType: "permit_package",
      afterStateRef: (created) => created.status
    }
  },
  {
    segment: "review-sessions",
    list: (repository, tenantId) => repository.listReviewSessionsByTenant(tenantId),
    validate: (parsed) =>
      !parsed?.id || !parsed?.projectId || !parsed?.createdBy || !Array.isArray(parsed?.artifactRefs)
        ? "Review session id, projectId, createdBy, and artifactRefs are required."
        : null,
    guard: async ({ parsed, tenantId, repository }) => {
      const project = await repository.getProjectById(parsed.projectId);
      return !project || project.tenantId !== tenantId
        ? "Review session creation requires an in-tenant project."
        : null;
    },
    build: (parsed, tenantId) => ({
      id: parsed.id,
      tenantId,
      projectId: parsed.projectId,
      createdBy: parsed.createdBy,
      artifactRefs: parsed.artifactRefs,
      status: parsed.status ?? "open",
      commentIds: parsed.commentIds ?? []
    }),
    create: (repository, input) => repository.createReviewSession(input),
    audit: {
      action: "api.review_session.created",
      resourceType: "review_session",
      afterStateRef: (created) => created.status
    }
  },
  {
    segment: "ai-review-runs",
    list: (repository, tenantId) => repository.listAiReviewRunsByTenant(tenantId),
    validate: (parsed) =>
      !parsed?.id || !parsed?.projectId || !parsed?.artifactType || !parsed?.artifactId
        ? "AI review run id, projectId, artifactType, and artifactId are required."
        : null,
    guard: async ({ parsed, tenantId, repository }) => {
      const project = await repository.getProjectById(parsed.projectId);
      return !project || project.tenantId !== tenantId
        ? "AI review run creation requires an in-tenant project."
        : null;
    },
    build: (parsed, tenantId) => ({
      id: parsed.id,
      tenantId,
      projectId: parsed.projectId,
      artifactType: parsed.artifactType,
      artifactId: parsed.artifactId,
      status: parsed.status ?? "queued",
      ruleVersion: parsed.ruleVersion ?? "rules-v1",
      modelVersion: parsed.modelVersion ?? "model-sim-v1",
      jurisdictionProfile: parsed.jurisdictionProfile ?? null
    }),
    create: (repository, input) => repository.createAiReviewRun(input),
    audit: {
      action: "api.ai_review_run.created",
      resourceType: "ai_review_run",
      afterStateRef: (created) => created.status
    }
  },
  {
    segment: "ai-findings",
    list: (repository, tenantId) => repository.listAiFindingsByTenant(tenantId),
    validate: (parsed) =>
      !parsed?.id || !parsed?.reviewRunId || !parsed?.category || !parsed?.title || !parsed?.description
        ? "AI finding id, reviewRunId, category, title, and description are required."
        : null,
    guard: async ({ parsed, tenantId, repository }) => {
      const reviewRun = await repository.getAiReviewRunById(parsed.reviewRunId);
      return !reviewRun || reviewRun.tenantId !== tenantId
        ? "AI finding creation requires an in-tenant review run."
        : null;
    },
    build: (parsed) => ({
      id: parsed.id,
      reviewRunId: parsed.reviewRunId,
      category: parsed.category,
      title: parsed.title,
      description: parsed.description,
      severity: parsed.severity ?? "medium",
      confidence: parsed.confidence ?? "medium",
      evidenceType: parsed.evidenceType ?? "hybrid",
      evidenceReferences: parsed.evidenceReferences ?? [],
      referencedStandard: parsed.referencedStandard ?? null,
      jurisdictionProfile: parsed.jurisdictionProfile ?? null,
      assumptions: parsed.assumptions ?? [],
      missingInformation: parsed.missingInformation ?? [],
      suggestedNextAction: parsed.suggestedNextAction ?? "Requires qualified review",
      assignedDiscipline: parsed.assignedDiscipline ?? null,
      humanDisposition: parsed.humanDisposition ?? "pending"
    }),
    create: (repository, input) => repository.createAiFinding(input),
    audit: {
      action: "api.ai_finding.created",
      resourceType: "ai_finding",
      afterStateRef: (created) => created.humanDisposition
    }
  },
  {
    segment: "platform-blueprints",
    list: (repository, tenantId) => repository.listPlatformBlueprintsByTenant(tenantId),
    validate: (parsed) =>
      !parsed?.id || !parsed?.businessName || !parsed?.industry
        ? "Platform blueprint id, businessName, and industry are required."
        : null,
    guard: ({ parsed, tenantId }) =>
      parsed.tenantId && parsed.tenantId !== tenantId ? "Cross-tenant blueprint creation denied." : null,
    build: (parsed, tenantId) => ({
      id: parsed.id,
      tenantId,
      businessName: parsed.businessName,
      industry: parsed.industry,
      serviceLine: parsed.serviceLine ?? null,
      roles: parsed.roles ?? [],
      workflows: parsed.workflows ?? [],
      painPoints: parsed.painPoints ?? [],
      portalRequirements: parsed.portalRequirements ?? [],
      dashboardRequirements: parsed.dashboardRequirements ?? [],
      aiAgentRequirements: parsed.aiAgentRequirements ?? [],
      documentReportingNeeds: parsed.documentReportingNeeds ?? [],
      integrationNeeds: parsed.integrationNeeds ?? [],
      selectedModules: parsed.selectedModules ?? []
    }),
    create: (repository, input) => repository.createPlatformBlueprint(input),
    audit: {
      action: "api.platform_blueprint.created",
      resourceType: "platform_blueprint",
      afterStateRef: (created) => created.industry
    }
  }
];

const collectionResourcesBySegment = new Map(
  collectionResources.map((resource) => [resource.segment, resource])
);

function ensureObjectBody(parsed) {
  if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
    return "Request body must be a JSON object.";
  }
  return null;
}

async function handleCollectionCreate({ resource, body, tenantId, actorId, repository, outbox }) {
  const parsed = parseBody(body);

  const bodyShapeError = ensureObjectBody(parsed);
  if (bodyShapeError) {
    return badRequest(bodyShapeError);
  }

  const validationError = resource.validate(parsed);
  if (validationError) {
    return badRequest(validationError);
  }

  const guardError = resource.guard ? await resource.guard({ parsed, tenantId, repository }) : null;
  if (guardError) {
    return forbidden(guardError);
  }

  try {
    const created = await resource.create(repository, resource.build(parsed, tenantId));

    await appendTenantAuditEvent({
      repository,
      tenantId,
      actorId,
      action: resource.audit.action,
      resourceType: resource.audit.resourceType,
      resourceId: created.id,
      afterStateRef: resource.audit.afterStateRef(created)
    });

    // Enqueue a durable domain event for async processing (worker drains it).
    outbox.enqueue(
      createOutboxEvent({
        eventType: resource.audit.action,
        aggregateType: resource.audit.resourceType,
        aggregateId: created.id,
        tenantId
      })
    );

    return json(201, {
      item: created,
      staged: true
    });
  } catch (error) {
    return badRequest(error.message);
  }
}

export async function handleApiRequest(request) {
  try {
    return await routeApiRequest(request);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return badRequest("Malformed JSON request body.");
    }

    return json(500, {
      error: "internal_error",
      message: "Staged runtime failed to process the request.",
      staged: true
    });
  }
}

async function routeApiRequest({
  method,
  path,
  headers = {},
  body = null,
  repository = defaultRepository,
  principal = null,
  authConfig = { mode: "staged" },
  outbox = sharedOutbox,
  idempotency = sharedIdempotency
}) {
  if (!["GET", "POST"].includes(method)) {
    return json(405, {
      error: "method_not_allowed",
      message: "Only staged read/write-safe endpoints are enabled.",
      staged: true
    });
  }

  // Separate pathname from query so query params never leak into route matching.
  const parsedUrl = new URL(path, "http://internal");
  const pathname = parsedUrl.pathname;
  const query = parsedUrl.searchParams;

  // /health is public — no principal required.
  if (pathname === "/health") {
    return json(200, {
      status: "ok",
      staged: true
    });
  }

  const parts = splitPath(pathname);

  if (parts[0] !== "v1" || parts[1] !== "tenants" || !parts[2]) {
    return notFound();
  }

  const tenantId = parts[2];

  // Resolve the identity. In OIDC mode the server pre-resolves and injects a
  // verified principal; if it is absent, the request is unauthenticated. In
  // staged mode we self-assert from headers (non-production).
  const effectivePrincipal =
    principal ?? (authConfig.mode === "oidc" ? null : resolveStagedPrincipal({ headers }));

  if (!effectivePrincipal) {
    return json(401, {
      error: "unauthorized",
      message: "Authentication required.",
      staged: true
    });
  }

  if (parts.length === 4) {
    const resource = collectionResourcesBySegment.get(parts[3]);
    if (resource) {
      const action = method === "POST" ? "create" : "read";
      const denied = authorize({
        principal: effectivePrincipal,
        tenantId,
        resource: resource.audit.resourceType,
        action
      });
      if (denied) {
        return denied;
      }

      if (method === "POST") {
        return await withIdempotency({
          idempotency,
          clientKey: headers["idempotency-key"] ?? headers["Idempotency-Key"],
          tenantId,
          path: pathname,
          compute: () =>
            handleCollectionCreate({
              resource,
              body,
              tenantId,
              actorId: effectivePrincipal.userId,
              repository,
              outbox
            })
        });
      }

      const { items, pagination } = paginate(await resource.list(repository, tenantId), query);
      return json(200, { items, pagination, staged: true });
    }
  }

  if (method === "GET" && parts.length === 5 && parts[3] === "platform-blueprints") {
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "platform_blueprint", action: "read" });
    if (denied) {
      return denied;
    }

    const blueprint = await repository.getPlatformBlueprintById(parts[4]);
    if (!blueprint || blueprint.tenantId !== tenantId) {
      return notFound("Platform blueprint not found.");
    }

    return json(200, { item: blueprint, staged: true });
  }

  if (parts.length === 6 && parts[3] === "ai-findings" && parts[5] === "disposition") {
    const denied = authorize({
      principal: effectivePrincipal,
      tenantId,
      resource: "ai_finding",
      action: "update"
    });
    if (denied) {
      return denied;
    }

    const findingId = parts[4];
    const finding = await repository.getAiFindingById(findingId);

    if (!finding) {
      return notFound("AI finding not found.");
    }

    const reviewRun = await repository.getAiReviewRunById(finding.reviewRunId);
    if (!reviewRun || reviewRun.tenantId !== tenantId) {
      return forbidden("AI finding disposition requires in-tenant access.");
    }

    const parsed = parseBody(body);
    const bodyShapeError = ensureObjectBody(parsed);
    if (bodyShapeError) {
      return badRequest(bodyShapeError);
    }
    if (!parsed?.nextDisposition) {
      return badRequest("nextDisposition is required.");
    }

    if (parsed.relatedIssueId) {
      const tenantIssues = await repository.listIssuesByTenant(tenantId);
      const relatedIssue = tenantIssues.find((issue) => issue.id === parsed.relatedIssueId);
      if (!relatedIssue) {
        return forbidden("Related issue must exist in-tenant.");
      }
    }

    try {
      const updated = await repository.setAiFindingDisposition({
        findingId,
        nextDisposition: parsed.nextDisposition,
        relatedIssueId: parsed.relatedIssueId ?? null
      });

      await appendTenantAuditEvent({
        repository,
        tenantId,
        actorId: effectivePrincipal.userId,
        action: "api.ai_finding.disposition_updated",
        resourceType: "ai_finding",
        resourceId: updated.id,
        beforeStateRef: finding.humanDisposition,
        afterStateRef: updated.humanDisposition
      });

      return json(200, {
        item: updated,
        staged: true
      });
    } catch (error) {
      return badRequest(error.message);
    }
  }

  if (parts.length === 5 && parts[3] === "dashboard" && parts[4] === "executive") {
    const denied = authorize({
      principal: effectivePrincipal,
      tenantId,
      resource: "executive_dashboard",
      action: "read"
    });
    if (denied) {
      return denied;
    }

    const [dashProjects, dashIssues, dashPermits] = await Promise.all([
      repository.listProjectsByTenant(tenantId),
      repository.listIssuesByTenant(tenantId),
      repository.listPermitPackagesByTenant(tenantId)
    ]);

    return json(200, {
      item: buildExecutivePortfolioView({
        tenantId,
        projects: dashProjects,
        issues: dashIssues,
        financeEvents: syntheticGovernanceEvents.filter((event) => event.tenantId === tenantId),
        permitPackages: dashPermits
      }),
      staged: true
    });
  }

  if (parts.length === 4 && parts[3] === "blueprint-workspace") {
    const denied = authorize({
      principal: effectivePrincipal,
      tenantId,
      resource: "project",
      action: "read"
    });
    if (denied) {
      return denied;
    }

    const [projects, reviewSessions, aiReviewRuns, aiFindings, issues, permits] = await Promise.all([
      repository.listProjectsByTenant(tenantId),
      repository.listReviewSessionsByTenant(tenantId),
      repository.listAiReviewRunsByTenant(tenantId),
      repository.listAiFindingsByTenant(tenantId),
      repository.listIssuesByTenant(tenantId),
      repository.listPermitPackagesByTenant(tenantId)
    ]);

    return json(200, {
      item: createBlueprintWorkspacePayload({
        tenantId,
        projects,
        reviewSessions,
        aiReviewRuns,
        aiFindings,
        issues,
        permits
      }),
      staged: true
    });
  }

  if (parts.length === 4 && parts[3] === "audit-events") {
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "audit_event", action: "read" });
    if (denied) {
      return denied;
    }

    const { items, pagination } = paginate(await repository.listAuditEventsByTenant(tenantId), query);
    return json(200, { items, pagination, staged: true });
  }

  if (parts.length === 5 && parts[3] === "audit-events" && parts[4] === "verify") {
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "audit_event", action: "read" });
    if (denied) {
      return denied;
    }

    const auditEvents = await repository.listAuditEventsByTenant(tenantId);
    return json(200, {
      item: buildAuditVerificationReport(auditEvents, { signingKey: auditSigningKey }),
      staged: true
    });
  }

  if (parts.length === 4 && parts[3] === "transfers") {
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "transfer", action: "read" });
    if (denied) {
      return denied;
    }

    return json(200, {
      item: buildTransferQueue({
        transferPackages: syntheticTransferPackages.filter(
          (transferPackage) => transferPackage.tenantId === tenantId
        )
      }),
      staged: true
    });
  }

  return notFound();
}
