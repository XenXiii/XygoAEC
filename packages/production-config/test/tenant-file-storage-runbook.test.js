import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const runbook = fs.readFileSync(
  new URL("../../../docs/operations/tenant-file-storage-runbook.md", import.meta.url),
  "utf8"
);

test("tenant file storage runbook defines staging setup and private access invariants", () => {
  for (const phrase of [
    "S3-compatible staging setup",
    "public-access blocking",
    "least-privilege runtime identity",
    "Never use `*` origins",
    "presigned targets",
    "cross-tenant download denial"
  ]) {
    assert.match(runbook, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("tenant file storage runbook defines retention, restore, incident, and rollback behavior", () => {
  for (const heading of [
    "## Backup, retention, and restore",
    "## Incident handling",
    "## Rollback"
  ]) {
    assert.ok(runbook.includes(heading), `missing runbook section: ${heading}`);
  }
  assert.match(runbook, /timed combined database\/object restore succeeds/);
  assert.match(runbook, /does not implement\s+malware scanning\/quarantine/);
  assert.match(runbook, /do not drop the table during an incident/);
});
