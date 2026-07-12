import test from "node:test";
import assert from "node:assert/strict";

import { createAuditEvent } from "../../audit/src/foundation.js";
import { createLoadScenario, summarizeQueueHealth, verifyAuditHealth } from "../src/index.js";

test("load scenarios preserve staged scale assumptions", () => {
  const scenario = createLoadScenario({
    name: "portfolio-medium",
    tenantCount: 5,
    userCount: 2000,
    projectCount: 300,
    messageCount: 1000000,
    concurrentReviewSessions: 50
  });

  assert.equal(scenario.staged, true);
  assert.equal(scenario.projectCount, 300);
});

test("queue health summarizes queue backlog", () => {
  const health = summarizeQueueHealth([{ items: [1, 2] }, { items: [3] }]);
  assert.equal(health.backlogSize, 3);
});

test("audit health wraps audit-chain verification", () => {
  const eventA = createAuditEvent({
    tenantId: "tenant-a",
    action: "test.a",
    resourceType: "resource",
    resourceId: "a"
  });
  const eventB = createAuditEvent({
    tenantId: "tenant-a",
    action: "test.b",
    resourceType: "resource",
    resourceId: "b",
    previousHash: eventA.eventHash
  });
  const health = verifyAuditHealth([eventA, eventB]);

  assert.equal(health.valid, true);
  assert.equal(health.checkedEventCount, 2);
});
