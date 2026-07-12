import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";
import { assertProjectAccess, assertSessionTenantAccess } from "../../auth/src/synthetic-auth.js";

const DISCIPLINE_SET = new Set([
  "architecture",
  "structural",
  "foundation",
  "framing",
  "plumbing",
  "electrical",
  "mechanical_hvac",
  "interior_design",
  "landscape",
  "civil_site",
  "construction_coordination",
  "permitting_code_review"
]);

const LIFECYCLE_STATES = new Set([
  "draft",
  "internal_review",
  "coordination_review",
  "returned_for_revision",
  "approved_for_permit",
  "approved_for_pricing",
  "approved_for_construction",
  "field_revision",
  "as_built",
  "superseded",
  "archived"
]);

const ALLOWED_TRANSITIONS = {
  draft: ["internal_review"],
  internal_review: ["coordination_review", "returned_for_revision"],
  coordination_review: ["returned_for_revision", "approved_for_permit", "approved_for_pricing"],
  returned_for_revision: ["internal_review"],
  approved_for_permit: ["approved_for_construction", "field_revision"],
  approved_for_pricing: ["approved_for_construction"],
  approved_for_construction: ["field_revision", "as_built"],
  field_revision: ["approved_for_construction", "as_built"],
  as_built: ["archived"],
  superseded: [],
  archived: []
};

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

export function createDisciplinePackage(input) {
  requiredString(input?.id, "Discipline package id");
  requiredString(input?.tenantId, "Discipline package tenantId");
  requiredString(input?.projectId, "Discipline package projectId");
  requiredString(input?.discipline, "Discipline package discipline");
  requiredString(input?.leadUserId, "Discipline package leadUserId");
  requiredArray(input?.memberUserIds ?? [], "Discipline package memberUserIds");

  if (!DISCIPLINE_SET.has(input.discipline)) {
    throw new Error(`Unknown discipline: ${input.discipline}`);
  }

  if (input?.staged !== true) {
    throw new Error("Discipline packages must be staged synthetic records.");
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    discipline: input.discipline,
    leadUserId: input.leadUserId,
    memberUserIds: input.memberUserIds,
    scope: input.scope ?? "",
    deliverables: input.deliverables ?? [],
    dependencies: input.dependencies ?? [],
    drawingIds: input.drawingIds ?? [],
    modelIds: input.modelIds ?? [],
    reviewGate: input.reviewGate ?? "internal_review",
    completionStatus: input.completionStatus ?? "not_started",
    staged: true
  };
}

export function createReviewSession(input) {
  requiredString(input?.id, "Review session id");
  requiredString(input?.tenantId, "Review session tenantId");
  requiredString(input?.projectId, "Review session projectId");
  requiredString(input?.createdBy, "Review session createdBy");
  requiredArray(input?.artifactRefs ?? [], "Review session artifactRefs");

  if (input?.staged !== true) {
    throw new Error("Review sessions must be staged synthetic records.");
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    createdBy: input.createdBy,
    artifactRefs: input.artifactRefs,
    status: input.status ?? "open",
    commentIds: input.commentIds ?? [],
    staged: true
  };
}

export function createReviewComment(input) {
  requiredString(input?.id, "Review comment id");
  requiredString(input?.tenantId, "Review comment tenantId");
  requiredString(input?.reviewSessionId, "Review comment reviewSessionId");
  requiredString(input?.authorUserId, "Review comment authorUserId");
  requiredString(input?.body, "Review comment body");

  return {
    id: input.id,
    tenantId: input.tenantId,
    reviewSessionId: input.reviewSessionId,
    authorUserId: input.authorUserId,
    body: input.body,
    markupRef: input.markupRef ?? null,
    dueDate: input.dueDate ?? null,
    staged: true
  };
}

export function transitionLifecycle({
  session,
  project,
  fromState,
  toState,
  requiredArtifactRefs = [],
  blockingIssueIds = [],
  correlationId
}) {
  assertSessionTenantAccess(session, project.tenantId);
  assertProjectAccess(session, project.id);

  if (!LIFECYCLE_STATES.has(fromState) || !LIFECYCLE_STATES.has(toState)) {
    throw new Error("Unknown lifecycle state transition.");
  }

  if (project.status !== fromState) {
    throw new Error("Project lifecycle transition rejected: stale fromState.");
  }

  if (!ALLOWED_TRANSITIONS[fromState]?.includes(toState)) {
    throw new Error(`Project lifecycle transition rejected: ${fromState} -> ${toState}`);
  }

  if (blockingIssueIds.length > 0 && ["approved_for_permit", "approved_for_construction"].includes(toState)) {
    throw new Error("Project lifecycle transition rejected: blocking issues remain.");
  }

  if (requiredArtifactRefs.length === 0 && ["approved_for_permit", "approved_for_construction"].includes(toState)) {
    throw new Error("Project lifecycle transition rejected: required artifacts missing.");
  }

  const updatedProject = {
    ...project,
    status: toState
  };

  const auditEvent = createAuditEvent({
    tenantId: project.tenantId,
    actorType: "user",
    actorId: session.userId,
    action: "project.lifecycle.transitioned",
    resourceType: "project",
    resourceId: project.id,
    beforeStateRef: fromState,
    afterStateRef: toState,
    correlationId
  });

  const outboxEvent = createOutboxEvent({
    eventType: "project.lifecycle.transitioned",
    aggregateType: "project",
    aggregateId: project.id,
    tenantId: project.tenantId,
    payload: {
      fromState,
      toState,
      requiredArtifactRefs
    }
  });

  return {
    project: updatedProject,
    auditEvent,
    outboxEvent
  };
}
