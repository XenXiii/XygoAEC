import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createFileRepository } from "../src/repositories/file.js";
import { createSqliteRepository } from "../src/repositories/sqlite.js";

test("file repository persists staged writes across repository recreation", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-api-repo-"));
  const filePath = path.join(tempDir, "api-store.json");

  const repositoryA = createFileRepository({ filePath });
  const createdProject = repositoryA.createProject({
    id: "project-commercial-persist",
    tenantId: "tenant-commercial-sim",
    name: "Persistent Synthetic Annex",
    projectType: "commercial",
    status: "draft"
  });

  assert.equal(createdProject.id, "project-commercial-persist");

  const repositoryB = createFileRepository({ filePath });
  const projects = repositoryB.listProjectsByTenant("tenant-commercial-sim");

  assert.ok(projects.some((project) => project.id === "project-commercial-persist"));
});

test("file repository persists governed AI finding disposition updates", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-api-repo-"));
  const filePath = path.join(tempDir, "api-store.json");

  const repositoryA = createFileRepository({ filePath });
  repositoryA.setAiFindingDisposition({
    findingId: "finding-commercial-a",
    nextDisposition: "accepted"
  });

  const repositoryB = createFileRepository({ filePath });
  const finding = repositoryB.getAiFindingById("finding-commercial-a");

  assert.equal(finding?.humanDisposition, "accepted");
});

test("sqlite repository persists staged writes across repository recreation", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-api-sqlite-"));
  const filePath = path.join(tempDir, "api-store.sqlite");

  const repositoryA = createSqliteRepository({ filePath });
  repositoryA.createProject({
    id: "project-commercial-sqlite",
    tenantId: "tenant-commercial-sim",
    name: "SQLite Synthetic Tower",
    projectType: "commercial",
    status: "draft"
  });

  const repositoryB = createSqliteRepository({ filePath });
  const projects = repositoryB.listProjectsByTenant("tenant-commercial-sim");

  assert.ok(projects.some((project) => project.id === "project-commercial-sqlite"));
});

test("sqlite repository persists appended audit events", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-api-sqlite-"));
  const filePath = path.join(tempDir, "api-store.sqlite");

  const repositoryA = createSqliteRepository({ filePath });
  repositoryA.appendAuditEvent({
    eventId: "audit-commercial-a",
    tenantId: "tenant-commercial-sim",
    action: "api.project.created",
    resourceType: "project",
    resourceId: "project-commercial-b",
    previousHash: null,
    eventHash: "synthetic-hash",
    actorType: "user",
    actorId: "user-commercial-admin",
    correlationId: "corr-a",
    requestId: "req-a",
    schemaVersion: 1,
    staged: true,
    timestamp: new Date().toISOString()
  });

  const repositoryB = createSqliteRepository({ filePath });
  const events = repositoryB.listAuditEventsByTenant("tenant-commercial-sim");

  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, "audit-commercial-a");
});

test("file repository writes atomically and leaves no temp artifacts", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-api-repo-"));
  const filePath = path.join(tempDir, "api-store.json");

  const repository = createFileRepository({ filePath });

  for (let index = 0; index < 5; index += 1) {
    repository.createProject({
      id: `project-atomic-${index}`,
      tenantId: "tenant-commercial-sim",
      name: `Atomic Annex ${index}`,
      projectType: "commercial",
      status: "draft"
    });
  }

  // The target file is always complete, parseable JSON.
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(parsed.projects.filter((project) => project.id.startsWith("project-atomic-")).length, 5);

  // No temp files are left behind after successful writes.
  const leftovers = fs.readdirSync(tempDir).filter((name) => name.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("file repository writes from separate instances remain consistent", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-api-repo-"));
  const filePath = path.join(tempDir, "api-store.json");

  const repositoryA = createFileRepository({ filePath });
  const repositoryB = createFileRepository({ filePath });

  repositoryA.createProject({
    id: "project-instance-a",
    tenantId: "tenant-commercial-sim",
    name: "Instance A Tower",
    projectType: "commercial",
    status: "draft"
  });

  // B reads A's committed write from disk (no stale in-memory cache).
  assert.ok(
    repositoryB.listProjectsByTenant("tenant-commercial-sim").some((project) => project.id === "project-instance-a")
  );

  repositoryB.createProject({
    id: "project-instance-b",
    tenantId: "tenant-commercial-sim",
    name: "Instance B Tower",
    projectType: "commercial",
    status: "draft"
  });

  const finalProjects = createFileRepository({ filePath }).listProjectsByTenant("tenant-commercial-sim");
  assert.ok(finalProjects.some((project) => project.id === "project-instance-a"));
  assert.ok(finalProjects.some((project) => project.id === "project-instance-b"));
});
