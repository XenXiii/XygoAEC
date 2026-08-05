import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const runbook = fs.readFileSync(
  new URL("../../../docs/operations/authenticated-web-login-runbook.md", import.meta.url),
  "utf8"
);

test("authenticated web login runbook covers PKCE, cookies, renewal, tenant isolation, and release", () => {
  for (const phrase of [
    "Authorization Code + PKCE", "/auth/callback", "refresh tokens remain", "__Host-", "SameSite=Lax",
    "XYGO_WEB_ALLOWED_ORIGIN", "clock tolerance", "cross-tenant", "Smoke and release checks",
    "0008_web_auth_sessions", "AES-256-GCM", "no session affinity", "/auth/events/stream", "access_token"
  ]) assert.ok(runbook.toLowerCase().includes(phrase.toLowerCase()), `missing runbook phrase: ${phrase}`);
});

test("authenticated web login runbook does not claim credentials or deployment exist", () => {
  assert.match(runbook, /No live identity-provider tenant/);
  assert.match(runbook, /never appear in `\/runtime-config\.json`/);
  assert.match(runbook, /shared PostgreSQL sessions/);
});
