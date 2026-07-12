import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";
import { assertProjectAccess, assertSessionTenantAccess } from "../../auth/src/synthetic-auth.js";

const ISSUE_STATUS_SET = new Set([
  "open",
  "triaged",
  "assigned",
  "in_progress",
  "under_review",
  "resolved",
  "closed",
  "returned",
  "deferred",
  "rejected_false_positive"
]);

const RFI_STATUS_SET = new Set([
  "draft",
  "submitted",
  "answered",
  "closed",
  "returned"
]);

const APPROVAL_STATUS_SET = new Set([
  "pending",
  "approved",
  "rejected",
  "needs_revision"
]);

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

export function createCoordinationIssue(input) {
  requiredString(input?.id, "Coordination issue id");
  requiredString(input?.tenantId, "Coordination issue tenantId");
  requiredString(input?.projectId, "Coordination issue projectId");
  requiredString(input?.title, "Coordination issue title");
  requiredString(input?.description, "Coordination issue description");
  requiredString(input?.status, "Coordination issue status");
  requiredArray(input?.disciplines ?? [], "Coordination issue disciplines");

  if (!ISSUE_STATUS_SET.has(input.status)) {
    throw new Error(`Unknown coordination issue status: ${input.status}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    status: input.status,
    type: input.type ?? "coordination_conflict",
    source: input.source ?? "manual",
    disciplines: input.disciplines,
    assignedLeadUserId: input.assignedLeadUserId ?? null,
    priority: input.priority ?? "medium",
    severity: input.severity ?? "medium",
    confidence: input.confidence ?? "confirmed",
    relatedSheetIds: input.relatedSheetIds ?? [],
    relatedModelIds: input.relatedModelIds ?? [],
    relatedElementIds: input.relatedElementIds ?? [],
    evidence: input.evidence ?? [],
    proposedResolution: input.proposedResolution ?? null,
    staged: true
  };
}

export function createBCFTopic(input) {
  requiredString(input?.id, "BCF topic id");
  requiredString(input?.tenantId, "BCF topic tenantId");
  requiredString(input?.projectId, "BCF topic projectId");
  requiredString(input?.issueId, "BCF topic issueId");
  requiredString(input?.topic, "BCF topic title");

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    issueId: input.issueId,
    topic: input.topic,
    viewpoint: input.viewpoint ?? null,
    camera: input.camera ?? null,
    selectedElements: input.selectedElements ?? [],
    snapshotRef: input.snapshotRef ?? null,
    comments: input.comments ?? [],
    priority: input.priority ?? "medium",
    staged: true
  };
}

export function createRfi(input) {
  requiredString(input?.id, "RFI id");
  requiredString(input?.tenantId, "RFI tenantId");
  requiredString(input?.projectId, "RFI projectId");
  requiredString(input?.title, "RFI title");
  requiredString(input?.status, "RFI status");

  if (!RFI_STATUS_SET.has(input.status)) {
    throw new Error(`Unknown RFI status: ${input.status}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    title: input.title,
    question: input.question ?? "",
    requestedBy: input.requestedBy ?? null,
    assignedTo: input.assignedTo ?? null,
    status: input.status,
    relatedSheetIds: input.relatedSheetIds ?? [],
    relatedIssueIds: input.relatedIssueIds ?? [],
    staged: true
  };
}

export function createApprovalRequest(input) {
  requiredString(input?.id, "Approval request id");
  requiredString(input?.tenantId, "Approval request tenantId");
  requiredString(input?.projectId, "Approval request projectId");
  requiredString(input?.approvalType, "Approval request approvalType");
  requiredString(input?.status, "Approval request status");

  if (!APPROVAL_STATUS_SET.has(input.status)) {
    throw new Error(`Unknown approval status: ${input.status}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    approvalType: input.approvalType,
    status: input.status,
    requestedBy: input.requestedBy ?? null,
    reviewerRole: input.reviewerRole ?? "approver",
    artifactRefs: input.artifactRefs ?? [],
    staged: true
  };
}

export function updateApprovalStatus({ session, approvalRequest, nextStatus }) {
  assertSessionTenantAccess(session, approvalRequest.tenantId);
  assertProjectAccess(session, approvalRequest.projectId);

  if (!APPROVAL_STATUS_SET.has(nextStatus)) {
    throw new Error(`Unknown approval status: ${nextStatus}`);
  }

  return {
    ...approvalRequest,
    status: nextStatus
  };
}

export function emitCoordinationAudit({ session, resource, action, payload = {} }) {
  return {
    auditEvent: createAuditEvent({
      tenantId: resource.tenantId,
      actorType: "user",
      actorId: session.userId,
      action,
      resourceType: resource.resourceType ?? "coordination_resource",
      resourceId: resource.id
    }),
    outboxEvent: createOutboxEvent({
      eventType: action,
      aggregateType: resource.resourceType ?? "coordination_resource",
      aggregateId: resource.id,
      tenantId: resource.tenantId,
      payload
    })
  };
}
