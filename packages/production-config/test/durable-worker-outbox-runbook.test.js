import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const runbook = fs.readFileSync(
  new URL("../../../docs/operations/durable-worker-outbox-runbook.md", import.meta.url),
  "utf8"
);

test("durable worker runbook documents migrations, claiming, retry, replay, and shutdown", () => {
  for (const phrase of [
    "0005_durable_outbox",
    "FOR UPDATE SKIP LOCKED",
    "at least once",
    "npm run check:outbox",
    "npm run outbox:inspect",
    "npm run outbox:replay",
    "graceful",
    "stale"
  ]) {
    assert.ok(runbook.includes(phrase), `missing worker runbook phrase: ${phrase}`);
  }
});

test("durable worker runbook does not claim providers or deployment were configured", () => {
  assert.match(runbook, /does not provision PostgreSQL, deploy a worker, install live credentials, send email/);
  assert.match(runbook, /Monitoring-provider alert wiring is a later slice/);
  assert.match(runbook, /do not drop `outbox_jobs` during an incident/);
});
