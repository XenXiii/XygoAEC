import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryRepository } from "../src/repositories/memory.js";
import { createFileRepository } from "../src/repositories/file.js";
import { createSqliteRepository } from "../src/repositories/sqlite.js";

// Conformance harness: every repository backend must satisfy the same contract.
// The seeded fixtures put all synthetic data under two tenants.
const TENANT_A = "tenant-commercial-sim";
const TENANT_B = "tenant-residential-sim";
const SEED_PROJECT_A = "project-commercial-b";
const SEED_PROJECT_B = "project-residential-a";
const SEED_REVIEW_RUN_A = "review-run-commercial-a";
const SEED_FINDING_A = "finding-commercial-a";

const KINDS = ["memory", "file", "sqlite"];

function freshRepository(kind) {
  if (kind === "memory") {
    return createMemoryRepository();
  }

  if (kind === "file") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-conformance-file-"));
    return createFileRepository({ filePath: path.join(dir, "api-store.json") });
  }

  if (kind === "sqlite") {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-conformance-sqlite-"));
    return createSqliteRepository({ filePath: path.join(dir, "api-store.sqlite") });
  }

  throw new Error(`Unknown repository kind: ${kind}`);
}

function newProjectInput(id, tenantId = TENANT_A) {
  return {
    id,
    tenantId,
    name: `Conformance ${id}`,
    projectType: "commercial",
    status: "draft"
  };
}

function newIssueInput(id, projectId, tenantId = TENANT_A) {
  return {
    id,
    tenantId,
    projectId,
    title: `Conformance issue ${id}`,
    description: "Staged conformance issue.",
    status: "open",
    disciplines: ["architecture"],
    severity: "medium",
    priority: "medium"
  };
}

function newFindingInput(id, reviewRunId = SEED_REVIEW_RUN_A) {
  return {
    id,
    reviewRunId,
    category: "insufficient_information",
    title: `Conformance finding ${id}`,
    description: "Potential issue: staged conformance finding. Requires qualified review.",
    severity: "medium"
  };
}

// A single deterministic scenario (no timestamps / random ids) used both for
// per-backend assertions and for cross-backend equivalence.
function runScenario(repository) {
  const project = repository.createProject(newProjectInput("project-conf-x"));
  const issue = repository.createIssue(newIssueInput("issue-conf-x", "project-conf-x"));
  const finding = repository.createAiFinding(newFindingInput("finding-conf-x"));
  const disposition = repository.setAiFindingDisposition({
    findingId: "finding-conf-x",
    nextDisposition: "accepted"
  });

  return {
    projectStaged: project.staged,
    projectTenant: project.tenantId,
    issueStaged: issue.staged,
    findingStaged: finding.staged,
    projectsForA: repository.listProjectsByTenant(TENANT_A).map((item) => item.id).sort(),
    projectsForB: repository.listProjectsByTenant(TENANT_B).map((item) => item.id).sort(),
    issuesForA: repository.listIssuesByTenant(TENANT_A).map((item) => item.id).sort(),
    issuesForProject: repository.listIssuesByProject("project-conf-x").map((item) => item.id).sort(),
    findingsForA: repository.listAiFindingsByTenant(TENANT_A).map((item) => item.id).sort(),
    findingsForB: repository.listAiFindingsByTenant(TENANT_B).map((item) => item.id).sort(),
    dispositionReturned: disposition.humanDisposition,
    dispositionPersisted: repository.getAiFindingById("finding-conf-x").humanDisposition
  };
}

for (const kind of KINDS) {
  test(`[${kind}] seed data is readable and tenant-scoped`, () => {
    const repository = freshRepository(kind);

    const projectsA = repository.listProjectsByTenant(TENANT_A);
    const projectsB = repository.listProjectsByTenant(TENANT_B);

    assert.ok(projectsA.some((project) => project.id === SEED_PROJECT_A));
    assert.ok(projectsB.some((project) => project.id === SEED_PROJECT_B));
    // Cross-tenant isolation: tenant A must not see tenant B's project.
    assert.ok(!projectsA.some((project) => project.id === SEED_PROJECT_B));
    assert.ok(!projectsB.some((project) => project.id === SEED_PROJECT_A));
  });

  test(`[${kind}] getProjectById is a global lookup independent of tenant`, () => {
    const repository = freshRepository(kind);

    assert.equal(repository.getProjectById(SEED_PROJECT_A)?.id, SEED_PROJECT_A);
    assert.equal(repository.getProjectById(SEED_PROJECT_B)?.id, SEED_PROJECT_B);
    assert.equal(repository.getProjectById("project-does-not-exist"), null);
  });

  test(`[${kind}] createProject persists, scopes, and rejects duplicate ids`, () => {
    const repository = freshRepository(kind);

    const created = repository.createProject(newProjectInput("project-conf-create"));
    assert.equal(created.id, "project-conf-create");
    assert.equal(created.staged, true);

    assert.ok(
      repository.listProjectsByTenant(TENANT_A).some((project) => project.id === "project-conf-create")
    );

    assert.throws(() => repository.createProject(newProjectInput("project-conf-create")));
  });

  test(`[${kind}] returned records are detached copies of stored state`, () => {
    const repository = freshRepository(kind);

    const created = repository.createProject(newProjectInput("project-conf-clone"));
    created.name = "MUTATED";

    assert.notEqual(repository.getProjectById("project-conf-clone").name, "MUTATED");
  });

  test(`[${kind}] createIssue requires no cross-store coupling and lists by tenant and project`, () => {
    const repository = freshRepository(kind);

    repository.createIssue(newIssueInput("issue-conf-a", SEED_PROJECT_A));

    assert.ok(repository.listIssuesByTenant(TENANT_A).some((issue) => issue.id === "issue-conf-a"));
    assert.ok(repository.listIssuesByProject(SEED_PROJECT_A).some((issue) => issue.id === "issue-conf-a"));
    assert.ok(!repository.listIssuesByTenant(TENANT_B).some((issue) => issue.id === "issue-conf-a"));
    assert.throws(() => repository.createIssue(newIssueInput("issue-conf-a", SEED_PROJECT_A)));
  });

  test(`[${kind}] AI findings are tenant-scoped via their review run`, () => {
    const repository = freshRepository(kind);

    // Seeded finding belongs to tenant A through review-run-commercial-a.
    assert.ok(
      repository.listAiFindingsByTenant(TENANT_A).some((finding) => finding.id === SEED_FINDING_A)
    );
    assert.ok(
      !repository.listAiFindingsByTenant(TENANT_B).some((finding) => finding.id === SEED_FINDING_A)
    );

    // A newly created finding under the same run inherits tenant A.
    repository.createAiFinding(newFindingInput("finding-conf-tenancy"));
    assert.ok(
      repository.listAiFindingsByTenant(TENANT_A).some((finding) => finding.id === "finding-conf-tenancy")
    );
    assert.ok(
      !repository.listAiFindingsByTenant(TENANT_B).some((finding) => finding.id === "finding-conf-tenancy")
    );
  });

  test(`[${kind}] setAiFindingDisposition updates and persists`, () => {
    const repository = freshRepository(kind);

    const updated = repository.setAiFindingDisposition({
      findingId: SEED_FINDING_A,
      nextDisposition: "accepted"
    });
    assert.equal(updated.humanDisposition, "accepted");
    assert.equal(repository.getAiFindingById(SEED_FINDING_A).humanDisposition, "accepted");

    assert.throws(() =>
      repository.setAiFindingDisposition({ findingId: "finding-missing", nextDisposition: "accepted" })
    );
  });

  test(`[${kind}] audit events append in insertion order and stay tenant-scoped`, () => {
    const repository = freshRepository(kind);

    const baseEvent = (eventId, tenantId) => ({
      eventId,
      tenantId,
      actorType: "user",
      actorId: "user-conf",
      action: "api.project.created",
      resourceType: "project",
      resourceId: "project-conf",
      beforeStateRef: null,
      afterStateRef: "draft",
      correlationId: `corr-${eventId}`,
      requestId: `req-${eventId}`,
      schemaVersion: 1,
      staged: true,
      previousHash: null,
      eventHash: `hash-${eventId}`,
      timestamp: "2026-07-11T00:00:00.000Z"
    });

    repository.appendAuditEvent(baseEvent("audit-conf-1", TENANT_A));
    repository.appendAuditEvent(baseEvent("audit-conf-2", TENANT_A));
    repository.appendAuditEvent(baseEvent("audit-conf-b1", TENANT_B));

    const eventsA = repository.listAuditEventsByTenant(TENANT_A);
    assert.deepEqual(eventsA.map((event) => event.eventId), ["audit-conf-1", "audit-conf-2"]);

    const eventsB = repository.listAuditEventsByTenant(TENANT_B);
    assert.deepEqual(eventsB.map((event) => event.eventId), ["audit-conf-b1"]);
  });
}

test("all backends produce identical results for the same scenario", () => {
  const [memoryResult, fileResult, sqliteResult] = KINDS.map((kind) => runScenario(freshRepository(kind)));

  assert.deepEqual(fileResult, memoryResult, "file backend diverged from memory backend");
  assert.deepEqual(sqliteResult, memoryResult, "sqlite backend diverged from memory backend");
});
