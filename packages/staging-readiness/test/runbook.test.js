import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("HTTPS staging runbook covers deploy, auth, cache, isolation, and rollback operations", () => {
  const runbook = read("../../../docs/operations/https-staging-deployment-runbook.md");
  for (const phrase of [
    "DNS", "TLS 1.2", "X-Forwarded-Proto", "IdP callback", "migrate:postgres", "check:staging",
    "smoke:staging", "session/renew", "PostgreSQL session", "events/stream", "cross-tenant",
    "Cache Storage", "runtime-config.json", "CACHE_VERSION", "Rollback", "access_token="
  ]) assert.match(runbook, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), phrase);
  assert.match(runbook, /does not authorize a deployment/i);
});

test("staging example is deliberately non-deployable and contains no credential values", () => {
  const example = read("../../../config/staging-deployment.env.example");
  assert.match(example, /<staging-web-host>/);
  assert.doesNotMatch(example, /(BEGIN (RSA |EC )?PRIVATE KEY|re_[A-Za-z0-9]{12,}|postgresql:\/\/[^<\s]+:[^<\s]+@)/i);
  assert.doesNotMatch(example, /XYGO_STAGING_SMOKE_ACCESS_TOKEN=/);
});
