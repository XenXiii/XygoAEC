import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const runbook = fs.readFileSync(
  new URL("../../../docs/operations/email-monitoring-runbook.md", import.meta.url),
  "utf8"
);

test("email monitoring runbook covers provider, DNS, webhooks, readiness, and incidents", () => {
  for (const phrase of [
    "0006_email_monitoring",
    "0007_email_suppressions",
    "Idempotency-Key",
    "SPF",
    "DKIM",
    "DMARC",
    "svix-signature",
    "GET /ready",
    "GET /metrics",
    "bounce",
    "complaint",
    "unsubscribe",
    "incident response",
    "rollback"
  ]) {
    assert.ok(runbook.toLowerCase().includes(phrase.toLowerCase()), `missing email runbook phrase: ${phrase}`);
  }
});

test("email monitoring runbook does not claim live services are configured", () => {
  assert.match(runbook, /does\s+not create a Resend account/);
  assert.match(runbook, /does not export telemetry/);
  assert.match(runbook, /never send real email/);
  assert.match(runbook, /Future deliveries.*suppressed.*without calling the provider/s);
});
