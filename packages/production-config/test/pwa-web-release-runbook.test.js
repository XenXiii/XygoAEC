import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const runbook = fs.readFileSync(new URL("../../../docs/operations/pwa-web-release-runbook.md", import.meta.url), "utf8");

test("PWA runbook covers install, private-cache exclusion, update, rollback, and smoke tests", () => {
  for (const phrase of ["/workspace", "shell-only", "/runtime-config.json", "Authorization header", "tenant files", "Cache Storage", "CACHE_VERSION", "roll back", "access denied", "Sign out"]) {
    assert.ok(runbook.toLowerCase().includes(phrase.toLowerCase()), `missing runbook phrase: ${phrase}`);
  }
});

test("PWA runbook does not claim deployment or credentials exist", () => {
  assert.match(runbook, /No live credentials, deployment, DNS, or HTTPS infrastructure/);
  assert.match(runbook, /Before staging deployment/);
});
