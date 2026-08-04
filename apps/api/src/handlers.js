import { buildExecutivePortfolioView, buildTransferQueue } from "../../../packages/dashboards/src/index.js";
import { buildAuditVerificationReport, createAuditEvent, createOutboxEvent } from "../../../packages/audit/src/foundation.js";
import {
  syntheticDrawingSheets,
  syntheticFileRecords,
  syntheticGovernanceEvents,
  syntheticPortalUpdates,
  syntheticTransferPackages
} from "../../../packages/test-fixtures/src/synthetic-tenants.js";
import { createRepositoryFromEnv } from "./repositories/index.js";
import { canPerform } from "../../../packages/authorization/src/policy.js";
import { resolveStagedPrincipal } from "./auth/principal.js";
import { generateReportDraft, setReviewStatus, toClientView } from "../../../packages/field-reporting/src/index.js";
import { buildClientPortalView } from "../../../packages/client-portal/src/index.js";
import { baseResponseHeaders } from "./http/headers.js";
import { enqueueOutboxEvent, sharedOutbox } from "./reliability/outbox.js";
import { createIdempotencyStore, idempotencyKeyFor } from "./reliability/idempotency.js";
import {
  createPendingFileRecord,
  createStorageFromEnv,
  publicFileMetadata
} from "../../../packages/file-storage/src/index.js";

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

function json(status, body) {
  return {
    status,
    headers: baseResponseHeaders({ "content-type": "application/json" }),
    body
  };
}

function binary(status, body, headers = {}) {
  return {
    status,
    headers: baseResponseHeaders(headers),
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

function unavailable(error, message) {
  return json(503, {
    error,
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
  afterStateRef = null,
  signingKey = null
}) {
  const event = await buildTenantAuditEvent({
    repository,
    tenantId,
    actorId,
    action,
    resourceType,
    resourceId,
    beforeStateRef,
    afterStateRef,
    signingKey
  });

  await repository.appendAuditEvent(event);
}

async function buildTenantAuditEvent({
  repository,
  tenantId,
  actorId,
  action,
  resourceType,
  resourceId,
  beforeStateRef = null,
  afterStateRef = null,
  signingKey = null
}) {
  const existingEvents = await repository.listAuditEventsByTenant(tenantId);
  const previousHash = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1].eventHash : null;

  return createAuditEvent({
    tenantId,
    actorType: "user",
    actorId: actorId ?? "synthetic-user",
    action,
    resourceType,
    resourceId,
    beforeStateRef,
    afterStateRef,
    previousHash,
    signingKey
  });
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
  },
  {
    segment: "field-reports",
    list: (repository, tenantId) => repository.listFieldReportsByTenant(tenantId),
    validate: (parsed) =>
      !parsed?.id || !parsed?.projectId || !parsed?.siteName || !parsed?.reportType || !parsed?.author
        ? "Field report id, projectId, siteName, reportType, and author are required."
        : null,
    guard: async ({ parsed, tenantId, repository }) => {
      if (parsed.tenantId && parsed.tenantId !== tenantId) {
        return "Cross-tenant field report creation denied.";
      }
      const project = await repository.getProjectById(parsed.projectId);
      return !project || project.tenantId !== tenantId
        ? "Field report creation requires an in-tenant project."
        : null;
    },
    build: (parsed, tenantId) => ({
      id: parsed.id,
      tenantId,
      projectId: parsed.projectId,
      siteName: parsed.siteName,
      reportType: parsed.reportType,
      author: parsed.author,
      capturedAt: parsed.capturedAt ?? null,
      observations: parsed.observations ?? []
    }),
    create: (repository, input) => repository.createFieldReport(input),
    audit: {
      action: "api.field_report.created",
      resourceType: "field_report",
      afterStateRef: (created) => created.status
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

async function handleCollectionCreate({ resource, body, tenantId, actorId, repository, outbox, auditSigningKey }) {
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
    let created;
    const persist = async () => {
      created = await resource.create(repository, resource.build(parsed, tenantId));
      await appendTenantAuditEvent({
        repository,
        tenantId,
        actorId,
        action: resource.audit.action,
        resourceType: resource.audit.resourceType,
        resourceId: created.id,
        afterStateRef: resource.audit.afterStateRef(created),
        signingKey: auditSigningKey
      });
      const outboxEvent = createOutboxEvent({
        eventType: resource.audit.action,
        aggregateType: resource.audit.resourceType,
        aggregateId: created.id,
        tenantId
      });
      const idempotencyKey = `${tenantId}:${resource.audit.action}:${created.id}`;
      if (repository.supportsTransactionalOutbox) {
        await repository.enqueueOutboxEvent(outboxEvent, { idempotencyKey });
      } else {
        await enqueueOutboxEvent(outbox, outboxEvent, { idempotencyKey });
      }
    };
    if (repository.supportsTransactionalOutbox) await repository.runTransaction(persist);
    else await persist();

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
  storage = null,
  principal = null,
  authConfig = { mode: "staged" },
  outbox = sharedOutbox,
  idempotency = sharedIdempotency,
  auditSigningKey = process.env.XYGO_AUDIT_SIGNING_KEY ?? null
}) {
  if (!["GET", "POST", "PUT", "DELETE"].includes(method)) {
    return json(405, {
      error: "method_not_allowed",
      message: "HTTP method is not enabled.",
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
  let activeStorage = storage;
  const storageForRequest = () => {
    activeStorage ??= createStorageFromEnv();
    return activeStorage;
  };

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

  const enqueueTenantOutbox = (action, resourceType, resourceId, idempotencyScope = null) => {
    const event = createOutboxEvent({
      eventType: action,
      aggregateType: resourceType,
      aggregateId: resourceId,
      tenantId
    });
    const idempotencyKey = [tenantId, action, resourceId, idempotencyScope].filter(Boolean).join(":");
    return repository.supportsTransactionalOutbox
      ? repository.enqueueOutboxEvent(event, { idempotencyKey })
      : enqueueOutboxEvent(outbox, event, { idempotencyKey });
  };

  const canReadFile = (fileRecord) => {
    if (!fileRecord || fileRecord.tenantId !== tenantId || fileRecord.status === "deleted") return notFound("File not found.");
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "file_record", action: "read" });
    if (denied) return denied;
    if (effectivePrincipal.organizationRole === "client_viewer" && (fileRecord.status !== "ready" || fileRecord.clientVisible !== true)) {
      return notFound("File not found.");
    }
    return null;
  };

  const fileOutboxEvent = (action, fileId) => createOutboxEvent({
    eventType: action,
    aggregateType: "file_record",
    aggregateId: fileId,
    tenantId
  });
  const enqueueFileOutbox = (action, fileId) => {
    const event = fileOutboxEvent(action, fileId);
    const idempotencyKey = `${tenantId}:${action}:${fileId}`;
    return repository.supportsTransactionalOutbox
      ? repository.enqueueOutboxEvent(event, { idempotencyKey })
      : enqueueOutboxEvent(outbox, event, { idempotencyKey });
  };

  const completeFileUpload = async (fileRecord) => {
    const object = await storageForRequest().headObject(fileRecord);
    if (!object) return badRequest("Uploaded object was not found.");
    if (object.tenantId !== fileRecord.tenantId) return forbidden("Stored object tenant metadata does not match.");
    if (object.contentType !== fileRecord.mimeType) return badRequest("Stored object MIME type does not match the upload intent.");
    if (object.sizeBytes !== fileRecord.sizeBytes) return badRequest("Stored object size does not match the upload intent.");
    const completedAt = new Date().toISOString();
    const completed = {
      ...fileRecord,
      status: "ready",
      checksumSha256: object.checksumSha256 ?? null,
      updatedAt: completedAt
    };
    const event = await buildTenantAuditEvent({
      repository,
      tenantId,
      actorId: effectivePrincipal.userId,
      action: "api.file.upload_completed",
      resourceType: "file_record",
      resourceId: completed.id,
      beforeStateRef: fileRecord.status,
      afterStateRef: completed.checksumSha256 ? `sha256:${completed.checksumSha256}` : "ready",
      signingKey: auditSigningKey
    });
    const outboxEvent = fileOutboxEvent("api.file.upload_completed", completed.id);
    const outboxIdempotencyKey = `${tenantId}:api.file.upload_completed:${completed.id}`;
    await repository.finalizeFileRecord({ fileRecord: completed, auditEvent: event, outboxEvent, outboxIdempotencyKey });
    if (!repository.supportsTransactionalOutbox) {
      await enqueueOutboxEvent(outbox, outboxEvent, { idempotencyKey: outboxIdempotencyKey });
    }
    return json(200, { item: publicFileMetadata(completed), staged: true });
  };

  if (parts[3] === "files") {
    if (method === "GET" && parts.length === 4) {
      const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "file_record", action: "read" });
      if (denied) return denied;
      let items = (await repository.listFileRecordsByTenant(tenantId)).filter((item) => item.status !== "deleted");
      if (effectivePrincipal.organizationRole === "client_viewer") {
        items = items.filter((item) => item.status === "ready" && item.clientVisible === true);
      }
      return json(200, { items: items.map(publicFileMetadata), staged: true });
    }

    if (method === "POST" && parts.length === 5 && parts[4] === "upload-intents") {
      const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "file_record", action: "create" });
      if (denied) return denied;
      const parsed = parseBody(body);
      const bodyShapeError = ensureObjectBody(parsed);
      if (bodyShapeError) return badRequest(bodyShapeError);
      const project = await repository.getProjectById(parsed?.projectId);
      if (!project || project.tenantId !== tenantId) return forbidden("File project must exist in-tenant.");
      let fieldReport = null;
      if (parsed?.fieldReportId) {
        fieldReport = await repository.getFieldReportById(parsed.fieldReportId);
        if (!fieldReport || fieldReport.tenantId !== tenantId || fieldReport.projectId !== project.id) {
          return forbidden("File report must exist in the same tenant and project.");
        }
      }
      if (["report_photo", "report_attachment"].includes(parsed?.fileClass) && !fieldReport) {
        return badRequest("Report files require fieldReportId.");
      }
      if (parsed?.clientVisible === true) {
        const mayPublish = ["xygo_admin", "client_owner", "platform_admin", "company_admin"].includes(
          effectivePrincipal.organizationRole
        );
        const approvedReport = fieldReport?.status === "approved" && fieldReport?.clientVisible === true;
        if (!mayPublish && !approvedReport) return forbidden("Only an owner/admin or an approved report may publish a file to the client portal.");
      }
      try {
        const storageAdapter = storageForRequest();
        const fileRecord = createPendingFileRecord({
          ...parsed,
          tenantId,
          createdBy: effectivePrincipal.userId
        }, storageAdapter.configuration);
        const upload = await storageAdapter.createUploadTarget(fileRecord);
        if (upload.mode === "authenticated_proxy") {
          upload.url = `/v1/tenants/${encodeURIComponent(tenantId)}/files/${encodeURIComponent(fileRecord.id)}/content`;
        }
        await repository.createFileRecord(fileRecord);
        return json(201, { item: publicFileMetadata(fileRecord), upload, staged: true });
      } catch (error) {
        return badRequest(error.message);
      }
    }

    if (parts.length >= 5) {
      const fileRecord = await repository.getFileRecordById(parts[4]);

      if (method === "POST" && parts.length === 6 && parts[5] === "complete") {
        const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "file_record", action: "update" });
        if (denied) return denied;
        if (!fileRecord || fileRecord.tenantId !== tenantId) return notFound("File not found.");
        if (fileRecord.status === "ready") {
          try {
            await enqueueFileOutbox("api.file.upload_completed", fileRecord.id);
          } catch {
            return unavailable("outbox_unavailable", "File is ready but its durable outbox event is still pending; retry completion.");
          }
          return json(200, { item: publicFileMetadata(fileRecord), staged: true });
        }
        if (fileRecord.status !== "pending_upload") return badRequest("File is not awaiting upload completion.");
        try {
          return await completeFileUpload(fileRecord);
        } catch {
          return unavailable("file_storage_unavailable", "File storage could not verify the uploaded object.");
        }
      }

      if (method === "PUT" && parts.length === 6 && parts[5] === "content") {
        const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "file_record", action: "update" });
        if (denied) return denied;
        if (!fileRecord || fileRecord.tenantId !== tenantId) return notFound("File not found.");
        if (fileRecord.status !== "pending_upload") return badRequest("File is not awaiting content.");
        const storageAdapter = storageForRequest();
        if (storageAdapter.driver !== "local") return badRequest("Direct API uploads are disabled for object storage.");
        if (!Buffer.isBuffer(body)) return badRequest("File content must be sent as a binary request body.");
        if (body.length !== fileRecord.sizeBytes) return badRequest("Uploaded content length does not match the declared file size.");
        const contentType = String(headers["content-type"] ?? headers["Content-Type"] ?? "").toLowerCase().split(";", 1)[0].trim();
        if (contentType !== fileRecord.mimeType) return badRequest("Uploaded content type does not match the declared MIME type.");
        try {
          await storageAdapter.putObject(fileRecord, body, contentType);
          return await completeFileUpload(fileRecord);
        } catch {
          return unavailable("file_storage_unavailable", "File storage could not persist or verify the uploaded object.");
        }
      }

      if (method === "GET" && parts.length === 6 && parts[5] === "download") {
        const denied = canReadFile(fileRecord);
        if (denied) return denied;
        if (fileRecord.status !== "ready") return notFound("File is not available.");
        const storageAdapter = storageForRequest();
        const download = await storageAdapter.createDownloadTarget(fileRecord);
        if (download.mode === "authenticated_proxy") {
          download.url = `/v1/tenants/${encodeURIComponent(tenantId)}/files/${encodeURIComponent(fileRecord.id)}/content`;
        }
        return json(200, { item: publicFileMetadata(fileRecord), download, staged: true });
      }

      if (method === "GET" && parts.length === 6 && parts[5] === "content") {
        const denied = canReadFile(fileRecord);
        if (denied) return denied;
        if (fileRecord.status !== "ready") return notFound("File is not available.");
        const storageAdapter = storageForRequest();
        if (storageAdapter.driver !== "local") return notFound("Direct file content is not served for object storage.");
        const object = await storageAdapter.getObject(fileRecord);
        if (!object || object.tenantId !== tenantId) return notFound("File content not found.");
        return binary(200, object.body, {
          "content-type": fileRecord.mimeType,
          "content-length": String(object.body.length),
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileRecord.originalFilename)}`,
          "cache-control": "private, no-store"
        });
      }

      if (method === "DELETE" && parts.length === 5) {
        const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "file_record", action: "delete" });
        if (denied) return denied;
        if (!fileRecord || fileRecord.tenantId !== tenantId) return notFound("File not found.");
        if (fileRecord.status === "deleted") {
          try {
            await enqueueFileOutbox("api.file.deleted", fileRecord.id);
          } catch {
            return unavailable("outbox_unavailable", "File is deleted but its durable outbox event is still pending; retry deletion.");
          }
          return json(200, { item: publicFileMetadata(fileRecord), staged: true });
        }
        const previous = fileRecord;
        const deleting = { ...fileRecord, status: "deleting", updatedAt: new Date().toISOString() };
        try {
          if (fileRecord.status !== "deleting") await repository.saveFileRecord(deleting);
          await storageForRequest().deleteObject(deleting);
        } catch {
          if (previous.status !== "deleting") {
            await Promise.resolve(repository.saveFileRecord(previous)).catch(() => {});
          }
          return unavailable("file_storage_unavailable", "File storage could not delete the object.");
        }
        try {
          const deletedAt = new Date().toISOString();
          const deleted = { ...deleting, status: "deleted", deletedAt, updatedAt: deletedAt };
          const event = await buildTenantAuditEvent({
            repository,
            tenantId,
            actorId: effectivePrincipal.userId,
            action: "api.file.deleted",
            resourceType: "file_record",
            resourceId: deleted.id,
            beforeStateRef: previous.status,
            afterStateRef: "deleted",
            signingKey: auditSigningKey
          });
          const outboxEvent = fileOutboxEvent("api.file.deleted", deleted.id);
          const outboxIdempotencyKey = `${tenantId}:api.file.deleted:${deleted.id}`;
          await repository.finalizeFileRecord({ fileRecord: deleted, auditEvent: event, outboxEvent, outboxIdempotencyKey });
          if (!repository.supportsTransactionalOutbox) {
            await enqueueOutboxEvent(outbox, outboxEvent, { idempotencyKey: outboxIdempotencyKey });
          }
          return json(200, { item: publicFileMetadata(deleted), staged: true });
        } catch {
          return unavailable(
            "file_delete_finalization_pending",
            "Object deletion succeeded; retry DELETE to finalize metadata and audit evidence."
          );
        }
      }
    }
  }

  if (["GET", "POST"].includes(method) && parts.length === 4) {
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
              outbox,
              auditSigningKey
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

  if (method === "GET" && parts.length === 5 && parts[3] === "field-reports") {
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "field_report", action: "read" });
    if (denied) {
      return denied;
    }

    const report = await repository.getFieldReportById(parts[4]);
    if (!report || report.tenantId !== tenantId) {
      return notFound("Field report not found.");
    }

    return json(200, { item: report, staged: true });
  }

  if (method === "POST" && parts.length === 6 && parts[3] === "field-reports" && parts[5] === "draft") {
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "field_report", action: "update" });
    if (denied) {
      return denied;
    }

    const report = await repository.getFieldReportById(parts[4]);
    if (!report || report.tenantId !== tenantId) {
      return notFound("Field report not found.");
    }

    try {
      let drafted;
      const persist = async () => {
        drafted = await repository.saveFieldReport(generateReportDraft(report));
        await appendTenantAuditEvent({
          repository,
          tenantId,
          actorId: effectivePrincipal.userId,
          action: "api.field_report.draft_generated",
          resourceType: "field_report",
          resourceId: drafted.id,
          beforeStateRef: report.status,
          afterStateRef: drafted.status,
          signingKey: auditSigningKey
        });
        await enqueueTenantOutbox("api.field_report.draft_generated", "field_report", drafted.id);
      };
      if (repository.supportsTransactionalOutbox) await repository.runTransaction(persist);
      else await persist();
      return json(200, { item: drafted, staged: true });
    } catch (error) {
      return badRequest(error.message);
    }
  }

  if (method === "POST" && parts.length === 6 && parts[3] === "field-reports" && parts[5] === "review") {
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "field_report", action: "update" });
    if (denied) {
      return denied;
    }

    const report = await repository.getFieldReportById(parts[4]);
    if (!report || report.tenantId !== tenantId) {
      return notFound("Field report not found.");
    }

    const parsed = parseBody(body);
    const bodyShapeError = ensureObjectBody(parsed);
    if (bodyShapeError) {
      return badRequest(bodyShapeError);
    }
    if (!parsed?.nextStatus) {
      return badRequest("nextStatus is required.");
    }

    try {
      let reviewed;
      const persist = async () => {
        reviewed = await repository.saveFieldReport(
          setReviewStatus(report, parsed.nextStatus, {
            reviewedBy: parsed.reviewedBy ?? effectivePrincipal.userId,
            reviewNote: parsed.reviewNote ?? null
          })
        );
        await appendTenantAuditEvent({
          repository,
          tenantId,
          actorId: effectivePrincipal.userId,
          action: "api.field_report.reviewed",
          resourceType: "field_report",
          resourceId: reviewed.id,
          beforeStateRef: report.status,
          afterStateRef: reviewed.status,
          signingKey: auditSigningKey
        });
        await enqueueTenantOutbox("api.field_report.reviewed", "field_report", reviewed.id, reviewed.status);
      };
      if (repository.supportsTransactionalOutbox) await repository.runTransaction(persist);
      else await persist();
      return json(200, { item: reviewed, staged: true });
    } catch (error) {
      return badRequest(error.message);
    }
  }

  if (method === "POST" && parts.length === 6 && parts[3] === "ai-findings" && parts[5] === "disposition") {
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
        afterStateRef: updated.humanDisposition,
        signingKey: auditSigningKey
      });

      return json(200, {
        item: updated,
        staged: true
      });
    } catch (error) {
      return badRequest(error.message);
    }
  }

  if (method === "GET" && parts.length === 5 && parts[3] === "dashboard" && parts[4] === "executive") {
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

  if (method === "GET" && parts.length === 4 && parts[3] === "blueprint-workspace") {
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

  if (method === "GET" && parts.length === 4 && parts[3] === "audit-events") {
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "audit_event", action: "read" });
    if (denied) {
      return denied;
    }

    const { items, pagination } = paginate(await repository.listAuditEventsByTenant(tenantId), query);
    return json(200, { items, pagination, staged: true });
  }

  if (method === "GET" && parts.length === 5 && parts[3] === "audit-events" && parts[4] === "verify") {
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

  if (method === "GET" && parts.length === 4 && parts[3] === "transfers") {
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

  // Read-only, client-facing portal: one composed view per project. Only APPROVED
  // field reports reach the client (via toClientView); payment is a staged placeholder.
  if (method === "GET" && parts.length === 4 && parts[3] === "client-portal") {
    const denied = authorize({ principal: effectivePrincipal, tenantId, resource: "client_portal", action: "read" });
    if (denied) {
      return denied;
    }

    const [projects, reports, fileRecords, storedPortalConfiguration, storedPortalData] = await Promise.all([
      repository.listProjectsByTenant(tenantId),
      repository.listFieldReportsByTenant(tenantId),
      repository.listFileRecordsByTenant(tenantId),
      typeof repository.getPortalConfigurationByTenant === "function"
        ? repository.getPortalConfigurationByTenant(tenantId)
        : null,
      typeof repository.getPortalDataByTenant === "function"
        ? repository.getPortalDataByTenant(tenantId)
        : null
    ]);
    const portalConfiguration = storedPortalConfiguration?.tenantId === tenantId
      ? storedPortalConfiguration
      : null;
    const portalData = storedPortalData?.tenantId === tenantId
      ? storedPortalData
      : null;

    const portals = projects.map((project) => {
      const approvedReports = reports
        .filter((report) => report.projectId === project.id)
        .map((report) => toClientView(report))
        .filter(Boolean);

      return buildClientPortalView({
        project,
        approvedReports,
        files: fileRecords.filter(
          (file) => file.tenantId === tenantId && file.projectId === project.id && file.status === "ready" && file.clientVisible === true
        ),
        updates: [
          ...syntheticPortalUpdates.filter(
            (update) => update.tenantId === tenantId && update.projectId === project.id
          ),
          ...(portalData?.projectId === project.id ? portalData.updates ?? [] : [])
        ]
      });
    });

    return json(200, {
      items: portals,
      configuration: portalConfiguration,
      welcomeMessage: portalData?.welcomeMessage ?? null,
      staged: true
    });
  }

  return notFound();
}
