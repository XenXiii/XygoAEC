import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";
import { assertProjectAccess, assertSessionTenantAccess } from "../../auth/src/synthetic-auth.js";

const EVENT_TYPE_SET = new Set([
  "project.created",
  "budget.baseline.proposed",
  "design.revision.approved",
  "cost.impact.requested",
  "cost.impact.reviewed",
  "approval.threshold.exceeded",
  "contract.deliverable.due",
  "permit.status.changed",
  "construction.revision.released",
  "compliance.review.required",
  "legal.review.required"
]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

export function createGovernanceEvent(input) {
  requiredString(input?.eventType, "Finance/legal eventType");
  requiredString(input?.tenantId, "Finance/legal tenantId");
  requiredString(input?.projectId, "Finance/legal projectId");

  if (!EVENT_TYPE_SET.has(input.eventType)) {
    throw new Error(`Unknown finance/legal event type: ${input.eventType}`);
  }

  return {
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? 1,
    tenantId: input.tenantId,
    projectId: input.projectId,
    revisionId: input.revisionId ?? null,
    estimatedCostImpact: input.estimatedCostImpact ?? null,
    requiresFinanceReview: input.requiresFinanceReview ?? false,
    requiresLegalReview: input.requiresLegalReview ?? false,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    correlationId: input.correlationId ?? `corr-${input.projectId}-${input.eventType}`,
    staged: true
  };
}

export function routeGovernanceQueues(events) {
  return {
    financeQueue: events.filter((event) => event.requiresFinanceReview === true),
    legalQueue: events.filter((event) => event.requiresLegalReview === true),
    staged: true
  };
}

export function emitGovernanceAudit({ session, governanceEvent }) {
  assertSessionTenantAccess(session, governanceEvent.tenantId);
  assertProjectAccess(session, governanceEvent.projectId);

  return {
    auditEvent: createAuditEvent({
      tenantId: governanceEvent.tenantId,
      actorType: "user",
      actorId: session.userId,
      action: `finance_contract.${governanceEvent.eventType}`,
      resourceType: "governance_event",
      resourceId: governanceEvent.correlationId
    }),
    outboxEvent: createOutboxEvent({
      eventType: governanceEvent.eventType,
      aggregateType: "governance_event",
      aggregateId: governanceEvent.correlationId,
      tenantId: governanceEvent.tenantId,
      payload: governanceEvent
    })
  };
}
