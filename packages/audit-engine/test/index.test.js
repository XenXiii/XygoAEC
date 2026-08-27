import test from "node:test";
import assert from "node:assert/strict";
import { applyFact, canAccessAuditSection, completeStage, createAuditState } from "../src/index.js";

const base = () => createAuditState({ workspaceId: "workspace-a", conversationId: "conversation-a" });
const fact = (overrides = {}) => ({ id: "fact-1", workspaceId: "workspace-a", stage: "business_profile", key: "company.name", value: "Acme", sourceType: "conversation", evidenceRef: "message-1", confidence: "high", ...overrides });

test("facts are validated and update audit readiness", () => {
  const state = applyFact(base(), fact());
  assert.equal(state.evidenceCoverage, 100);
  assert.equal(state.confidence, "high");
});
test("cross-workspace and unknown fields are rejected", () => {
  assert.throws(() => applyFact(base(), fact({ workspaceId: "workspace-b" })), /Cross-workspace/);
  assert.throws(() => applyFact(base(), fact({ surprise: true })), /Unknown fact field/);
});
test("contradictory facts produce an explicit conflict", () => {
  const first = applyFact(base(), fact());
  const second = applyFact(first, fact({ id: "fact-2", value: "Other" }));
  assert.equal(second.conflicts[0].status, "unresolved");
  assert.equal(second.freeResultEligible, false);
});
test("stages progress non-linearly without duplicates", () => {
  const state = completeStage(completeStage(base(), "finance_and_margin"), "business_profile");
  assert.deepEqual(state.completedStages, ["finance_and_margin", "business_profile"]);
  assert.equal(state.currentStage, "goals_and_growth");
});
test("server entitlement exposes exactly one free recommendation", () => {
  assert.equal(canAccessAuditSection({ entitlement: "free", section: "recommendation", recommendationIndex: 0 }), true);
  assert.equal(canAccessAuditSection({ entitlement: "free", section: "recommendation", recommendationIndex: 1 }), false);
  assert.equal(canAccessAuditSection({ entitlement: "active", section: "scenarios" }), true);
});
