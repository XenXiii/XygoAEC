import { buildExecutivePortfolioView, buildTransferQueue } from "../../../packages/dashboards/src/index.js";
import { buildAuditVerificationReport, createAuditEvent } from "../../../packages/audit/src/foundation.js";
import { syntheticGovernanceEvents, syntheticTransferPackages } from "../../../packages/test-fixtures/src/synthetic-tenants.js";
import { createRepositoryFromEnv } from "./repositories/index.js";
import { canAccessTenant, extractStagedAuth } from "./staged-auth.js";

const defaultRepository = createRepositoryFromEnv();

function json(status, body) {
  return {
    status,
    headers: {
      "content-type": "application/json",
      "x-xygo-staged-mode": "true",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-staged-tenant-id,x-staged-user-id",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    },
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

function requireTenantAccess(headers, tenantId) {
  return canAccessTenant({ headers, tenantId });
}

function appendTenantAuditEvent({
  repository,
  tenantId,
  headers,
  action,
  resourceType,
  resourceId,
  beforeStateRef = null,
  afterStateRef = null
}) {
  const existingEvents = repository.listAuditEventsByTenant(tenantId);
  const previousHash = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1].eventHash : null;
  const auth = extractStagedAuth({ headers });

  const event = createAuditEvent({
    tenantId,
    actorType: "user",
    actorId: auth.userId,
    action,
    resourceType,
    resourceId,
    beforeStateRef,
    afterStateRef,
    previousHash
  });

  repository.appendAuditEvent(event);
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
    guard: ({ parsed, tenantId, repository }) => {
      const project = repository.getProjectById(parsed.projectId);
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
    guard: ({ parsed, tenantId, repository }) => {
      const project = repository.getProjectById(parsed.projectId);
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
    guard: ({ parsed, tenantId, repository }) => {
      const project = repository.getProjectById(parsed.projectId);
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
    guard: ({ parsed, tenantId, repository }) => {
      const project = repository.getProjectById(parsed.projectId);
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
    guard: ({ parsed, tenantId, repository }) => {
      const project = repository.getProjectById(parsed.projectId);
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
    guard: ({ parsed, tenantId, repository }) => {
      const reviewRun = repository.getAiReviewRunById(parsed.reviewRunId);
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
  }
];

const collectionResourcesBySegment = new Map(
  collectionResources.map((resource) => [resource.segment, resource])
);

function handleCollectionCreate({ resource, body, tenantId, headers, repository }) {
  const parsed = parseBody(body);

  const validationError = resource.validate(parsed);
  if (validationError) {
    return badRequest(validationError);
  }

  const guardError = resource.guard ? resource.guard({ parsed, tenantId, repository }) : null;
  if (guardError) {
    return forbidden(guardError);
  }

  try {
    const created = resource.create(repository, resource.build(parsed, tenantId));

    appendTenantAuditEvent({
      repository,
      tenantId,
      headers,
      action: resource.audit.action,
      resourceType: resource.audit.resourceType,
      resourceId: created.id,
      afterStateRef: resource.audit.afterStateRef(created)
    });

    return json(201, {
      item: created,
      staged: true
    });
  } catch (error) {
    return badRequest(error.message);
  }
}

export function handleApiRequest(request) {
  try {
    return routeApiRequest(request);
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

function routeApiRequest({ method, path, headers = {}, body = null, repository = defaultRepository }) {
  if (!["GET", "POST"].includes(method)) {
    return json(405, {
      error: "method_not_allowed",
      message: "Only staged read/write-safe endpoints are enabled.",
      staged: true
    });
  }

  if (path === "/health") {
    return json(200, {
      status: "ok",
      staged: true
    });
  }

  const parts = splitPath(path);

  if (parts[0] !== "v1" || parts[1] !== "tenants" || !parts[2]) {
    return notFound();
  }

  const tenantId = parts[2];
  if (!requireTenantAccess(headers, tenantId)) {
    return forbidden();
  }

  if (parts.length === 4) {
    const resource = collectionResourcesBySegment.get(parts[3]);
    if (resource) {
      if (method === "POST") {
        return handleCollectionCreate({ resource, body, tenantId, headers, repository });
      }

      return json(200, {
        items: resource.list(repository, tenantId),
        staged: true
      });
    }
  }

  if (parts.length === 6 && parts[3] === "ai-findings" && parts[5] === "disposition") {
    const findingId = parts[4];
    const finding = repository.getAiFindingById(findingId);

    if (!finding) {
      return notFound("AI finding not found.");
    }

    const reviewRun = repository.getAiReviewRunById(finding.reviewRunId);
    if (!reviewRun || reviewRun.tenantId !== tenantId) {
      return forbidden("AI finding disposition requires in-tenant access.");
    }

    const parsed = parseBody(body);
    if (!parsed?.nextDisposition) {
      return badRequest("nextDisposition is required.");
    }

    if (parsed.relatedIssueId) {
      const relatedIssue = repository.listIssuesByTenant(tenantId).find((issue) => issue.id === parsed.relatedIssueId);
      if (!relatedIssue) {
        return forbidden("Related issue must exist in-tenant.");
      }
    }

    try {
      const updated = repository.setAiFindingDisposition({
        findingId,
        nextDisposition: parsed.nextDisposition,
        relatedIssueId: parsed.relatedIssueId ?? null
      });

      appendTenantAuditEvent({
        repository,
        tenantId,
        headers,
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
    return json(200, {
      item: buildExecutivePortfolioView({
        tenantId,
        projects: repository.listProjectsByTenant(tenantId),
        issues: repository.listIssuesByTenant(tenantId),
        financeEvents: syntheticGovernanceEvents.filter((event) => event.tenantId === tenantId),
        permitPackages: repository.listPermitPackagesByTenant(tenantId)
      }),
      staged: true
    });
  }

  if (parts.length === 4 && parts[3] === "audit-events") {
    return json(200, {
      items: repository.listAuditEventsByTenant(tenantId),
      staged: true
    });
  }

  if (parts.length === 5 && parts[3] === "audit-events" && parts[4] === "verify") {
    return json(200, {
      item: buildAuditVerificationReport(repository.listAuditEventsByTenant(tenantId)),
      staged: true
    });
  }

  if (parts.length === 4 && parts[3] === "transfers") {
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
