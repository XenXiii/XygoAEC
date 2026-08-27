import test from "node:test";
import assert from "node:assert/strict";
import { billingHandoffUrl, mayQueueOffline, mobileConfig, parseSseChunk, workspacePath } from "../src/client.js";

test("mobile config requires HTTPS API and OIDC PKCE inputs", () => {
  assert.throws(() => mobileConfig({}), /not configured/);
  assert.throws(() => mobileConfig({ EXPO_PUBLIC_XYGO_API_URL: "http://example.com", EXPO_PUBLIC_XYGO_OIDC_ISSUER: "https://id.example", EXPO_PUBLIC_XYGO_OIDC_CLIENT_ID: "client", EXPO_PUBLIC_XYGO_OIDC_AUDIENCE: "api" }), /HTTPS/);
  assert.equal(mobileConfig({ EXPO_PUBLIC_XYGO_API_URL: "https://api.example.com", EXPO_PUBLIC_XYGO_OIDC_ISSUER: "https://id.example", EXPO_PUBLIC_XYGO_OIDC_CLIENT_ID: "client", EXPO_PUBLIC_XYGO_OIDC_AUDIENCE: "api" }).clientId, "client");
});
test("offline queue denies billing, permissions, and external actions", () => {
  assert.equal(mayQueueOffline("conversation_draft"), true);
  for (const operation of ["checkout", "invite_member", "run_external_action"]) assert.equal(mayQueueOffline(operation), false);
});
test("workspace API paths are validated and encoded", () => {
  assert.equal(workspacePath("workspace-1", "billing/entitlement"), "/v1/workspaces/workspace-1/billing/entitlement");
  assert.throws(() => workspacePath("../other", "billing"), /invalid/);
});
test("stream parser supports message, canvas, and completion events", () => {
  const events = parseSseChunk('event: delta\ndata: {"text":"hello"}\n\nevent: done\ndata: {"messageId":"m1"}\n\n');
  assert.deepEqual(events.map((item) => item.event), ["delta", "done"]);
});
test("billing handoff stays on the account website", () => {
  assert.equal(billingHandoffUrl("https://www.xygo.pro", "w1"), "https://www.xygo.pro/app?workspace=w1&source=mobile");
});
