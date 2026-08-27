import test from "node:test";
import assert from "node:assert/strict";
import { authorizeToolInvocation, validateCopilotOutput } from "../src/index.js";
test("structured output rejects schema expansion", () => assert.throws(() => validateCopilotOutput({ message: "Hi", executeShell: true }), /Unknown/));
test("tools require allowlist, tenant scope, approval, and idempotency", () => {
  const context = { allowedTools: ["send_invoice"], workspaceId: "w", requiresApproval: ["send_invoice"] };
  assert.equal(authorizeToolInvocation({ tool: "send_invoice", workspaceId: "w", idempotencyKey: "i" }, context).reason, "human_approval_required");
  assert.equal(authorizeToolInvocation({ tool: "send_invoice", workspaceId: "w", idempotencyKey: "i", approvalStatus: "approved" }, context).allowed, true);
});
