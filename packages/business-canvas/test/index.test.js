import test from "node:test";
import assert from "node:assert/strict";
import { applyFact, createAuditState } from "../../audit-engine/src/index.js";
import { projectBusinessCanvas } from "../src/index.js";
test("canvas projections preserve evidence and paid gating", () => {
  const state = applyFact(createAuditState({ workspaceId: "w", conversationId: "c" }), { id: "f", workspaceId: "w", stage: "business_profile", key: "name", value: "Xygo", sourceType: "manual", evidenceRef: "e", confidence: "medium" });
  const canvas = projectBusinessCanvas(state);
  assert.equal(canvas.panels[0].items[0].evidenceRef, "e");
  assert.equal(canvas.locked, true);
  assert.equal(projectBusinessCanvas(state, "active").locked, false);
});
