import test from "node:test";
import assert from "node:assert/strict";

import { createSyntheticSession } from "../../auth/src/synthetic-auth.js";
import { createGovernanceEvent, emitGovernanceAudit, routeGovernanceQueues } from "../src/index.js";

test("finance/legal events reject unknown event types", () => {
  assert.throws(
    () =>
      createGovernanceEvent({
        eventType: "money.teleported",
        tenantId: "tenant-a",
        projectId: "project-a"
      }),
    /Unknown finance\/legal event type/
  );
});

test("finance and legal queues split staged events correctly", () => {
  const queues = routeGovernanceQueues([
    createGovernanceEvent({
      eventType: "design.revision.approved",
      tenantId: "tenant-a",
      projectId: "project-a",
      requiresFinanceReview: true
    }),
    createGovernanceEvent({
      eventType: "legal.review.required",
      tenantId: "tenant-a",
      projectId: "project-a",
      requiresLegalReview: true
    })
  ]);

  assert.equal(queues.financeQueue.length, 1);
  assert.equal(queues.legalQueue.length, 1);
});

test("finance/legal audits emit audit and outbox events", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const event = createGovernanceEvent({
    eventType: "design.revision.approved",
    tenantId: "tenant-a",
    projectId: "project-a",
    requiresFinanceReview: true
  });
  const result = emitGovernanceAudit({
    session,
    governanceEvent: event
  });

  assert.equal(result.auditEvent.action, "finance_contract.design.revision.approved");
  assert.equal(result.outboxEvent.eventType, "design.revision.approved");
});
