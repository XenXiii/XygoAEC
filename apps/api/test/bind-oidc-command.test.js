import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

test("managed IdP binding command refuses to omit the activation application URL", () => {
  const script = path.resolve(process.cwd(), "scripts/bind-oidc-user.mjs");
  const result = spawnSync(process.execPath, [
    script,
    "--tenant-id", "tenant-test",
    "--email", "owner@client.invalid",
    "--subject", "subject-test",
    "--actor-id", "operator-test",
    "--approve-managed-idp-binding"
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      XYGO_API_PG_URL: "postgresql://unused.invalid/database",
      XYGO_OIDC_ISSUER: "https://issuer.test.invalid/",
      XYGO_WEB_APP_URL: ""
    }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /XYGO_WEB_APP_URL is required/);
});
