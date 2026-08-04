import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const runbook = fs.readFileSync(
  new URL("../../../docs/operations/managed-postgres-runbook.md", import.meta.url),
  "utf8"
);

test("managed Postgres runbook keeps migration separate from application startup", () => {
  assert.match(runbook, /Application processes never apply PostgreSQL migrations/);
  assert.match(runbook, /npm run migrate:postgres/);
  assert.match(runbook, /npm run check:postgres/);
  assert.match(runbook, /before listening/);
  assert.match(runbook, /CI is deliberately different/);
});

test("managed Postgres runbook contains the required operational recovery procedures", () => {
  for (const heading of [
    "## Connection pool contract",
    "## Staging and production deployment sequence",
    "## Readiness behavior",
    "## Backup checklist",
    "## Timed restore drill",
    "## Failed migration or deployment rollback"
  ]) {
    assert.ok(runbook.includes(heading), `missing runbook section: ${heading}`);
  }
  assert.match(runbook, /Record achieved RTO/);
  assert.match(runbook, /Restore the pre-deploy snapshot or PITR/);
  assert.match(runbook, /Never overwrite the source database/);
});
