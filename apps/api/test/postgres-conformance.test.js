import test from "node:test";
import assert from "node:assert/strict";

import { createPostgresRepository } from "../src/repositories/postgres.js";

// Gated: only runs when a Postgres URL is provided (CI postgres job). Verifies the
// postgres backend satisfies the same repository contract as memory/file/sqlite.
// Skipped in the offline dev sandbox, where Postgres is unavailable.
const PG_URL = process.env.XYGO_TEST_PG_URL;
const skip = PG_URL ? false : "set XYGO_TEST_PG_URL to run the postgres conformance suite";

const TENANT_A = "tenant-commercial-sim";
const TENANT_B = "tenant-residential-sim";

test("postgres backend satisfies the repository contract", { skip }, async (t) => {
  const repo = createPostgresRepository({ connectionString: PG_URL });
  t.after(() => repo.close());

  // Seed reads + tenant scoping.
  const projectsA = await repo.listProjectsByTenant(TENANT_A);
  assert.ok(projectsA.some((p) => p.id === "project-commercial-b"));
  assert.ok(!projectsA.some((p) => p.id === "project-residential-a"));

  // getProjectById is a global lookup.
  assert.equal((await repo.getProjectById("project-commercial-b"))?.id, "project-commercial-b");
  assert.equal(await repo.getProjectById("nope"), null);

  // Create + persist + duplicate rejection.
  const created = await repo.createProject({
    id: "project-pg-conf",
    tenantId: TENANT_A,
    name: "PG Conformance Tower",
    projectType: "commercial",
    status: "draft"
  });
  assert.equal(created.staged, true);
  assert.ok((await repo.listProjectsByTenant(TENANT_A)).some((p) => p.id === "project-pg-conf"));
  await assert.rejects(() =>
    repo.createProject({ id: "project-pg-conf", tenantId: TENANT_A, name: "dup" })
  );

  // Issue create + FK to project + tenant scoping.
  await repo.createIssue({
    id: "issue-pg-conf",
    tenantId: TENANT_A,
    projectId: "project-commercial-b",
    title: "t",
    description: "d",
    status: "open",
    disciplines: ["architecture"],
    severity: "medium",
    priority: "medium"
  });
  assert.ok((await repo.listIssuesByTenant(TENANT_A)).some((i) => i.id === "issue-pg-conf"));
  assert.ok(!(await repo.listIssuesByTenant(TENANT_B)).some((i) => i.id === "issue-pg-conf"));

  // AI finding tenancy via review run.
  const findingsA = await repo.listAiFindingsByTenant(TENANT_A);
  assert.ok(findingsA.some((f) => f.id === "finding-commercial-a"));
  assert.ok(!(await repo.listAiFindingsByTenant(TENANT_B)).some((f) => f.id === "finding-commercial-a"));

  // Disposition update persists.
  const updated = await repo.setAiFindingDisposition({
    findingId: "finding-commercial-a",
    nextDisposition: "accepted"
  });
  assert.equal(updated.humanDisposition, "accepted");
  assert.equal((await repo.getAiFindingById("finding-commercial-a")).humanDisposition, "accepted");

  // Audit append + ordered per-tenant read.
  const baseEvent = (eventId) => ({
    eventId,
    tenantId: TENANT_A,
    action: "api.project.created",
    resourceType: "project",
    resourceId: "project-pg-conf",
    previousHash: null,
    eventHash: `hash-${eventId}`,
    staged: true
  });
  await repo.appendAuditEvent(baseEvent("audit-pg-1"));
  await repo.appendAuditEvent(baseEvent("audit-pg-2"));
  const events = await repo.listAuditEventsByTenant(TENANT_A);
  const ids = events.map((e) => e.eventId);
  assert.deepEqual(ids.slice(-2), ["audit-pg-1", "audit-pg-2"]);
});
