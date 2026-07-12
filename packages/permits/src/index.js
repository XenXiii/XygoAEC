import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";
import { assertProjectAccess, assertSessionTenantAccess } from "../../auth/src/synthetic-auth.js";

const PERMIT_STATE_SET = new Set([
  "package_preparation",
  "internal_completeness_review",
  "ready_for_submission",
  "simulated_submitted",
  "reviewer_comments_received",
  "revision_required",
  "revision_in_progress",
  "simulated_resubmitted",
  "simulated_approved",
  "closed"
]);

const ALLOWED_PERMIT_TRANSITIONS = {
  package_preparation: ["internal_completeness_review"],
  internal_completeness_review: ["ready_for_submission", "revision_required"],
  ready_for_submission: ["simulated_submitted"],
  simulated_submitted: ["reviewer_comments_received", "simulated_approved"],
  reviewer_comments_received: ["revision_required", "simulated_approved"],
  revision_required: ["revision_in_progress"],
  revision_in_progress: ["simulated_resubmitted"],
  simulated_resubmitted: ["reviewer_comments_received", "simulated_approved"],
  simulated_approved: ["closed"],
  closed: []
};

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

export function createPermitPackage(input) {
  requiredString(input?.id, "Permit package id");
  requiredString(input?.tenantId, "Permit package tenantId");
  requiredString(input?.projectId, "Permit package projectId");
  requiredString(input?.jurisdictionProfile, "Permit package jurisdictionProfile");
  requiredString(input?.status, "Permit package status");

  if (!PERMIT_STATE_SET.has(input.status)) {
    throw new Error(`Unknown permit status: ${input.status}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    jurisdictionProfile: input.jurisdictionProfile,
    status: input.status,
    submissionPackageRefs: input.submissionPackageRefs ?? [],
    requiredFormsChecklist: input.requiredFormsChecklist ?? [],
    reviewComments: input.reviewComments ?? [],
    responseMatrix: input.responseMatrix ?? [],
    submissionCycles: input.submissionCycles ?? 0,
    permitReadinessFindings: input.permitReadinessFindings ?? [],
    staged: true
  };
}

export function transitionPermitPackage({ session, permitPackage, nextStatus, reviewComments = [] }) {
  assertSessionTenantAccess(session, permitPackage.tenantId);
  assertProjectAccess(session, permitPackage.projectId);

  if (!PERMIT_STATE_SET.has(nextStatus)) {
    throw new Error(`Unknown permit status: ${nextStatus}`);
  }

  if (!ALLOWED_PERMIT_TRANSITIONS[permitPackage.status]?.includes(nextStatus)) {
    throw new Error(`Permit lifecycle transition rejected: ${permitPackage.status} -> ${nextStatus}`);
  }

  if (nextStatus === "ready_for_submission" && permitPackage.requiredFormsChecklist.includes(false)) {
    throw new Error("Permit lifecycle transition rejected: required forms incomplete.");
  }

  if (nextStatus === "simulated_submitted" && permitPackage.submissionPackageRefs.length === 0) {
    throw new Error("Permit lifecycle transition rejected: submission package missing.");
  }

  if (nextStatus === "reviewer_comments_received" && reviewComments.length === 0) {
    throw new Error("Permit lifecycle transition rejected: review comments are required.");
  }

  const updated = {
    ...permitPackage,
    status: nextStatus,
    reviewComments: reviewComments.length > 0 ? reviewComments : permitPackage.reviewComments,
    submissionCycles:
      nextStatus === "simulated_submitted" || nextStatus === "simulated_resubmitted"
        ? permitPackage.submissionCycles + 1
        : permitPackage.submissionCycles
  };

  return {
    permitPackage: updated,
    auditEvent: createAuditEvent({
      tenantId: permitPackage.tenantId,
      actorType: "user",
      actorId: session.userId,
      action: "permit.lifecycle.transitioned",
      resourceType: "permit_package",
      resourceId: permitPackage.id,
      beforeStateRef: permitPackage.status,
      afterStateRef: nextStatus
    }),
    outboxEvent: createOutboxEvent({
      eventType: "permit.lifecycle.transitioned",
      aggregateType: "permit_package",
      aggregateId: permitPackage.id,
      tenantId: permitPackage.tenantId,
      payload: {
        nextStatus
      }
    })
  };
}
