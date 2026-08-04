import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import { createStaticJwks } from "../src/auth/jwks.js";
import { resolveOidcPrincipal } from "../src/auth/principal.js";
import { handleApiRequest } from "../src/handlers.js";
import { createPostgresRepository } from "../src/repositories/postgres.js";
import { createAuditEvent, createOutboxEvent } from "../../../packages/audit/src/foundation.js";
import {
  createPostgresOutboxStore,
  enqueueOutboxEvent,
  processOutboxOnce
} from "../src/reliability/outbox.js";
import {
  applyPostgresMigrations,
  checkPostgresReadiness
} from "../src/repositories/postgres-migrations.js";

// Gated: only runs when a Postgres URL is provided (CI postgres job). Verifies the
// postgres backend satisfies the same repository contract as memory/file/sqlite.
// Skipped in the offline dev sandbox, where Postgres is unavailable.
const PG_URL = process.env.XYGO_TEST_PG_URL;
const requirePostgres = process.env.XYGO_REQUIRE_PG_TESTS === "true";
if (requirePostgres && !PG_URL) {
  throw new Error("XYGO_REQUIRE_PG_TESTS=true requires XYGO_TEST_PG_URL; refusing to skip Postgres tests.");
}
const skip = PG_URL ? false : "set XYGO_TEST_PG_URL to run the postgres conformance suite";

const TENANT_A = "tenant-commercial-sim";
const TENANT_B = "tenant-residential-sim";
const OIDC_ISSUER = "https://issuer.postgres.test/";
const OIDC_AUDIENCE = "xygo-api";
const OIDC_KID = "postgres-oidc-test-key";
const OIDC_NOW_SEC = 1_800_000_000;
const { publicKey: oidcPublicKey, privateKey: oidcPrivateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048
});
const oidcJwk = {
  ...oidcPublicKey.export({ format: "jwk" }),
  kid: OIDC_KID,
  use: "sig",
  alg: "RS256"
};

function signOidcToken(subject) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: OIDC_KID, typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: OIDC_ISSUER,
    aud: OIDC_AUDIENCE,
    sub: subject,
    exp: OIDC_NOW_SEC + 3600,
    iat: OIDC_NOW_SEC - 10,
    org_id: TENANT_B,
    "https://xygo/org_role": "xygo_admin"
  })).toString("base64url");
  const input = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(input), oidcPrivateKey).toString("base64url");
  return `${input}.${signature}`;
}

const oidcConfig = {
  mode: "oidc",
  oidc: {
    issuer: OIDC_ISSUER,
    audience: OIDC_AUDIENCE,
    allowedAlgorithms: ["RS256"],
    clockToleranceSec: 60
  }
};

test("postgres schema contains every canonical provisioning table", { skip }, async (t) => {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: PG_URL });
  t.after(() => pool.end());
  const expectedTables = [
    "audit_events",
    "business_profiles",
    "file_records",
    "oidc_identities",
    "outbox_jobs",
    "platform_blueprints",
    "portal_configurations",
    "portal_data",
    "projects",
    "provisioning_events",
    "role_assignments",
    "schema_migrations",
    "tenants",
    "users"
  ];
  const result = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name",
    [expectedTables]
  );
  assert.deepEqual(result.rows.map((row) => row.table_name), expectedTables);

  const migrations = await pool.query("SELECT version FROM schema_migrations ORDER BY version");
  assert.deepEqual(migrations.rows.map((row) => row.version), [
    "0001_init",
    "0002_paid_client_provisioning",
    "0003_oidc_authorization",
    "0004_tenant_file_storage",
    "0005_durable_outbox"
  ]);
});

test("postgres readiness verifies connectivity and the complete migration chain", { skip }, async (t) => {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: PG_URL });
  t.after(() => pool.end());

  const readiness = await checkPostgresReadiness(pool);
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.migrations, [
    "0001_init",
    "0002_paid_client_provisioning",
    "0003_oidc_authorization",
    "0004_tenant_file_storage",
    "0005_durable_outbox"
  ]);
});

test("postgres migration runner is repeatable and does not rewrite applied records", { skip }, async (t) => {
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: PG_URL });
  t.after(() => pool.end());
  const before = await pool.query("SELECT version, applied_at FROM schema_migrations ORDER BY version");

  const first = await applyPostgresMigrations(pool);
  const second = await applyPostgresMigrations(pool);
  const after = await pool.query("SELECT version, applied_at FROM schema_migrations ORDER BY version");

  assert.deepEqual(first, second);
  assert.deepEqual(after.rows, before.rows);
});

test("postgres repository refuses an unmigrated schema without changing it", { skip }, async (t) => {
  const pg = (await import("pg")).default;
  const adminPool = new pg.Pool({ connectionString: PG_URL });
  const schemaName = `unmigrated_${process.pid}`;
  const repository = createPostgresRepository({
    connectionString: PG_URL,
    poolOptions: { options: `-c search_path=${schemaName}` }
  });
  t.after(async () => {
    await repository.close();
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    await adminPool.end();
  });
  await adminPool.query(`CREATE SCHEMA ${schemaName}`);

  await assert.rejects(
    () => repository.checkReadiness(),
    (error) => error.code === "postgres_schema_not_current" && error.migrationStatus.pending.length === 5
  );
  const tables = await adminPool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
    [schemaName]
  );
  assert.deepEqual(tables.rows, []);
});

test("postgres backend satisfies the repository contract", { skip }, async (t) => {
  const repo = createPostgresRepository({ connectionString: PG_URL, seedSyntheticData: true });
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

test("postgres outbox is durable, safely claimed, tenant-scoped, idempotent, and replayable", { skip }, async (t) => {
  const pg = (await import("pg")).default;
  const cleanupPool = new pg.Pool({ connectionString: PG_URL });
  await cleanupPool.query(
    "INSERT INTO tenants (id, name) VALUES ($1,$1),($2,$2) ON CONFLICT (id) DO NOTHING",
    [TENANT_A, TENANT_B]
  );
  await cleanupPool.query("DELETE FROM outbox_jobs");
  const storeA = createPostgresOutboxStore({ connectionString: PG_URL, poolOptions: { max: 2 } });
  const storeB = createPostgresOutboxStore({ connectionString: PG_URL, poolOptions: { max: 2 } });
  t.after(async () => {
    await Promise.all([storeA.close(), storeB.close()]);
    await cleanupPool.end();
  });
  const job = (id, tenantId = TENANT_A) => createOutboxEvent({
    id,
    tenantId,
    eventType: "report.delivery.requested",
    aggregateType: "field_report",
    aggregateId: `report-${id}`,
    payload: { reportId: `report-${id}` },
    occurredAt: "2026-08-04T00:00:00.000Z"
  });

  const first = await enqueueOutboxEvent(storeA, job("pg-job-a"), {
    idempotencyKey: "tenant-a:report:one",
    now: 0
  });
  const duplicate = await enqueueOutboxEvent(storeB, { ...job("pg-job-a"), id: "pg-job-duplicate" }, {
    idempotencyKey: "tenant-a:report:one",
    now: 1
  });
  await enqueueOutboxEvent(storeA, job("pg-job-b", TENANT_B), { now: 0 });
  assert.equal(duplicate.id, first.id);
  assert.deepEqual((await storeA.list({ tenantId: TENANT_A })).map((item) => item.id), ["pg-job-a"]);
  assert.deepEqual((await storeA.list({ tenantId: TENANT_B })).map((item) => item.id), ["pg-job-b"]);

  const [claimedA, claimedB] = await Promise.all([
    storeA.claim({ workerId: "pg-worker-a", now: 0, limit: 1, staleAfterMs: 1000 }),
    storeB.claim({ workerId: "pg-worker-b", now: 0, limit: 1, staleAfterMs: 1000 })
  ]);
  const claimed = [...claimedA, ...claimedB];
  assert.equal(claimed.length, 2);
  assert.equal(new Set(claimed.map((item) => item.id)).size, 2);
  await Promise.all(claimed.map((item) =>
    (item.lockedBy === "pg-worker-a" ? storeA : storeB).complete({
      id: item.id,
      workerId: item.lockedBy,
      now: 1
    })
  ));

  await enqueueOutboxEvent(storeA, job("pg-job-retry"), { now: 0 });
  const failing = async () => { throw new Error("downstream unavailable"); };
  const firstFailure = await processOutboxOnce({
    store: storeA,
    handler: failing,
    workerId: "pg-worker-retry-a",
    now: 0,
    maxAttempts: 2,
    baseBackoffMs: 1000,
    maxBackoffMs: 1000
  });
  assert.equal(firstFailure.retried, 1);
  const finalFailure = await processOutboxOnce({
    store: storeB,
    handler: failing,
    workerId: "pg-worker-retry-b",
    now: 1000,
    maxAttempts: 2,
    baseBackoffMs: 1000,
    maxBackoffMs: 1000
  });
  assert.equal(finalFailure.dead, 1);
  await assert.rejects(() => storeA.checkReadiness({ maxDeadJobs: 0, requireHealthy: true }), /Outbox is unhealthy/);
  assert.equal(await storeA.replay({
    id: "pg-job-retry",
    tenantId: TENANT_B,
    reason: "wrong tenant"
  }), null);
  const replayed = await storeA.replay({
    id: "pg-job-retry",
    tenantId: TENANT_A,
    reason: "dependency recovered",
    now: 2000
  });
  assert.equal(replayed.status, "pending");
  assert.equal(replayed.replayCount, 1);
  assert.equal(replayed.lastReplayReason, "dependency recovered");
});

test("postgres application writes, audit evidence, and outbox enqueue commit or roll back together", { skip }, async (t) => {
  const suffix = `${process.pid}-${Date.now()}`;
  const projectId = `project-outbox-atomic-${suffix}`;
  const repository = createPostgresRepository({ connectionString: PG_URL, seedSyntheticData: true });
  const outbox = createPostgresOutboxStore({ connectionString: PG_URL });
  const rollbackRepository = createPostgresRepository({
    connectionString: PG_URL,
    beforeOutboxCommit: async () => { throw new Error("simulated outbox transaction failure"); }
  });
  t.after(async () => Promise.all([repository.close(), rollbackRepository.close(), outbox.close()]));

  const response = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${TENANT_A}/projects`,
    headers: { "x-staged-tenant-id": TENANT_A },
    repository,
    body: JSON.stringify({ id: projectId, name: "Atomic outbox project", projectType: "commercial" })
  });
  assert.equal(response.status, 201);
  assert.equal((await repository.getProjectById(projectId)).id, projectId);
  assert.ok((await repository.listAuditEventsByTenant(TENANT_A)).some(
    (event) => event.resourceId === projectId && event.action === "api.project.created"
  ));
  assert.ok((await outbox.list({ tenantId: TENANT_A })).some(
    (job) => job.event.aggregateId === projectId && job.event.eventType === "api.project.created"
  ));

  const rollbackProjectId = `${projectId}-rollback`;
  const rolledBack = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${TENANT_A}/projects`,
    headers: { "x-staged-tenant-id": TENANT_A },
    repository: rollbackRepository,
    body: JSON.stringify({ id: rollbackProjectId, name: "Rollback outbox project", projectType: "commercial" })
  });
  assert.equal(rolledBack.status, 400);
  assert.equal(await repository.getProjectById(rollbackProjectId), null);
  assert.ok(!(await repository.listAuditEventsByTenant(TENANT_A)).some(
    (event) => event.resourceId === rollbackProjectId
  ));
  assert.ok(!(await outbox.list({ tenantId: TENANT_A })).some(
    (job) => job.event.aggregateId === rollbackProjectId
  ));
});

test("postgres persists tenant-scoped file metadata and atomically links upload audit evidence", { skip }, async (t) => {
  const repo = createPostgresRepository({ connectionString: PG_URL, seedSyntheticData: true });
  const outbox = createPostgresOutboxStore({ connectionString: PG_URL });
  t.after(() => Promise.all([repo.close(), outbox.close()]));
  const suffix = `${process.pid}-${Date.now()}`;
  const pending = {
    id: `file-pg-${suffix}`,
    tenantId: TENANT_A,
    projectId: "project-commercial-b",
    fieldReportId: "field-report-commercial-b",
    fileClass: "report_photo",
    originalFilename: "postgres-photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 4,
    storageKey: `tenants/tenant-commercial-sim-test/files/${suffix}`,
    status: "pending_upload",
    checksumSha256: null,
    clientVisible: true,
    createdBy: "postgres-test-user",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:00.000Z",
    retentionUntil: "2027-08-04T00:00:00.000Z",
    deletedAt: null
  };
  await repo.createFileRecord(pending);
  assert.equal((await repo.getFileRecordById(pending.id)).status, "pending_upload");
  assert.ok((await repo.listFileRecordsByTenant(TENANT_A)).some((item) => item.id === pending.id));
  assert.ok(!(await repo.listFileRecordsByTenant(TENANT_B)).some((item) => item.id === pending.id));

  const ready = { ...pending, status: "ready", checksumSha256: "a".repeat(64) };
  const auditEvent = createAuditEvent({
    eventId: `audit-file-pg-${suffix}`,
    tenantId: TENANT_A,
    action: "api.file.upload_completed",
    resourceType: "file_record",
    resourceId: pending.id,
    afterStateRef: `sha256:${ready.checksumSha256}`
  });
  const outboxEvent = createOutboxEvent({
    id: `outbox-file-pg-${suffix}`,
    tenantId: TENANT_A,
    eventType: "api.file.upload_completed",
    aggregateType: "file_record",
    aggregateId: pending.id
  });
  await repo.finalizeFileRecord({
    fileRecord: ready,
    auditEvent,
    outboxEvent,
    outboxIdempotencyKey: `${TENANT_A}:api.file.upload_completed:${pending.id}`
  });
  assert.equal((await repo.getFileRecordById(pending.id)).checksumSha256, ready.checksumSha256);
  assert.ok((await repo.listAuditEventsByTenant(TENANT_A)).some(
    (event) => event.eventId === auditEvent.eventId && event.resourceId === pending.id
  ));
  assert.ok((await outbox.list({ tenantId: TENANT_A })).some(
    (job) => job.event.id === outboxEvent.id && job.event.aggregateId === pending.id
  ));

  const rollbackRecord = { ...pending, id: `file-pg-rollback-${suffix}`, storageKey: `tenants/tenant-commercial-sim-test/files/rollback-${suffix}` };
  await repo.createFileRecord(rollbackRecord);
  const duplicateAudit = createAuditEvent({
    eventId: auditEvent.eventId,
    tenantId: TENANT_A,
    action: "api.file.upload_completed",
    resourceType: "file_record",
    resourceId: rollbackRecord.id
  });
  await assert.rejects(() => repo.finalizeFileRecord({
    fileRecord: { ...rollbackRecord, status: "ready" },
    auditEvent: duplicateAudit
  }));
  assert.equal((await repo.getFileRecordById(rollbackRecord.id)).status, "pending_upload");
});

function provisioningInput(slug, email = `owner@${slug}.invalid`) {
  return {
    staged: true,
    slug,
    businessName: `${slug} Contracting`,
    projectName: `${slug} Starter Project`,
    users: [{ email, displayName: `${slug} Owner`, role: "client_owner" }]
  };
}

test("postgres provisioning is canonical, idempotent, and conflict-safe", { skip }, async (t) => {
  const repo = createPostgresRepository({ connectionString: PG_URL, seedSyntheticData: true });
  t.after(() => repo.close());
  const slug = `pg-paid-client-conf-${process.pid}`;
  const tenantId = `tenant-${slug}`;

  const first = await repo.provisionStagedTenant(provisioningInput(slug));
  const second = await repo.provisionStagedTenant(provisioningInput(slug));

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal((await repo.getTenantById(tenantId)).id, tenantId);
  assert.equal((await repo.listUsersByTenant(tenantId)).length, 1);
  assert.equal((await repo.listRoleAssignmentsByTenant(tenantId))[0].role, "client_owner");
  assert.equal((await repo.getBusinessProfileByTenant(tenantId)).tenantId, tenantId);
  assert.ok((await repo.listProjectsByTenant(tenantId)).some((item) => item.id === `${tenantId}-project-1`));
  assert.ok((await repo.listPlatformBlueprintsByTenant(tenantId)).some((item) => item.id === `${tenantId}-blueprint-1`));
  assert.equal((await repo.getPortalConfigurationByTenant(tenantId)).approvedContentOnly, true);
  assert.equal((await repo.getPortalDataByTenant(tenantId)).projectId, `${tenantId}-project-1`);
  assert.equal((await repo.getPortalDataByTenant(tenantId)).updates.length, 1);
  assert.equal((await repo.listProvisioningEventsByTenant(tenantId)).length, 1);
  assert.ok((await repo.listAuditEventsByTenant(tenantId)).some((item) => item.action === "staged_tenant.provisioned"));

  await assert.rejects(
    () => repo.provisionStagedTenant(provisioningInput(slug, `changed@${slug}.invalid`)),
    /different provisioning input/
  );
});

test("verified OIDC identity resolves tenant and role from canonical Postgres records", { skip }, async (t) => {
  const repo = createPostgresRepository({ connectionString: PG_URL, seedSyntheticData: true });
  t.after(() => repo.close());
  const slug = `pg-oidc-auth-${process.pid}`;
  const tenantId = `tenant-${slug}`;
  const subject = `subject-${slug}`;
  const input = {
    ...provisioningInput(slug),
    oidcIssuer: OIDC_ISSUER,
    users: [{
      email: `owner@${slug}.invalid`,
      displayName: `${slug} Owner`,
      role: "client_owner",
      oidcSubject: subject
    }]
  };

  await repo.provisionStagedTenant(input);
  const identities = await repo.listOidcIdentitiesByTenant(tenantId);
  assert.equal(identities.length, 1);
  assert.equal(identities[0].subject, subject);
  assert.deepEqual(
    await repo.resolveOidcAuthorization({ issuer: "https://wrong-issuer.postgres.test/", subject }),
    { status: "not_found" }
  );

  const principal = await resolveOidcPrincipal({
    headers: { authorization: `Bearer ${signOidcToken(subject)}` },
    jwks: createStaticJwks([oidcJwk]),
    config: oidcConfig,
    repository: repo,
    now: OIDC_NOW_SEC * 1000
  });

  assert.equal(principal.userId, `${tenantId}-user-1`);
  assert.equal(principal.tenantId, tenantId);
  assert.equal(principal.organizationRole, "client_owner");
  assert.equal(principal.staged, false);

  const portal = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${tenantId}/client-portal`,
    repository: repo,
    principal,
    authConfig: oidcConfig
  });
  assert.equal(portal.status, 200);

  const crossTenant = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${TENANT_B}/client-portal`,
    repository: repo,
    principal,
    authConfig: oidcConfig
  });
  assert.equal(crossTenant.status, 403);

  const crossTenantProject = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${tenantId}/field-reports`,
    body: JSON.stringify({
      id: `${tenantId}-cross-project-report`,
      projectId: "project-residential-a",
      siteName: "Cross-tenant project",
      reportType: "daily_log",
      author: principal.userId,
      observations: []
    }),
    repository: repo,
    principal,
    authConfig: oidcConfig
  });
  assert.equal(crossTenantProject.status, 403);

  await assert.rejects(
    () => resolveOidcPrincipal({
      headers: { authorization: `Bearer ${signOidcToken("unprovisioned-subject")}` },
      jwks: createStaticJwks([oidcJwk]),
      config: oidcConfig,
      repository: repo,
      now: OIDC_NOW_SEC * 1000
    }),
    (error) => error.code === "identity_not_provisioned"
  );

  const conflictingSlug = `${slug}-conflict`;
  await assert.rejects(
    () => repo.provisionStagedTenant({
      ...provisioningInput(conflictingSlug),
      oidcIssuer: OIDC_ISSUER,
      users: [{
        email: `owner@${conflictingSlug}.invalid`,
        displayName: `${conflictingSlug} Owner`,
        role: "client_owner",
        oidcSubject: subject
      }]
    }),
    (error) => error.code === "23505"
  );
  assert.equal(await repo.getTenantById(`tenant-${conflictingSlug}`), null);

  const pg = (await import("pg")).default;
  const statusPool = new pg.Pool({ connectionString: PG_URL });
  t.after(() => statusPool.end());
  await statusPool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [`${tenantId}-user-1`]);
  await assert.rejects(
    () => resolveOidcPrincipal({
      headers: { authorization: `Bearer ${signOidcToken(subject)}` },
      jwks: createStaticJwks([oidcJwk]),
      config: oidcConfig,
      repository: repo,
      now: OIDC_NOW_SEC * 1000
    }),
    (error) => error.code === "identity_not_provisioned"
  );
  await statusPool.query("UPDATE users SET status = 'active' WHERE id = $1", [`${tenantId}-user-1`]);
  await statusPool.query("UPDATE tenants SET status = 'inactive' WHERE id = $1", [tenantId]);
  await assert.rejects(
    () => resolveOidcPrincipal({
      headers: { authorization: `Bearer ${signOidcToken(subject)}` },
      jwks: createStaticJwks([oidcJwk]),
      config: oidcConfig,
      repository: repo,
      now: OIDC_NOW_SEC * 1000
    }),
    (error) => error.code === "identity_not_provisioned"
  );
});

test("managed IdP binding activates a provisioned user transactionally", { skip }, async (t) => {
  const repo = createPostgresRepository({ connectionString: PG_URL, seedSyntheticData: true });
  t.after(() => repo.close());
  const slug = `pg-managed-idp-bind-${process.pid}`;
  const tenantId = `tenant-${slug}`;
  const ownerEmail = `owner@${slug}.invalid`;
  const staffEmail = `staff@${slug}.invalid`;
  const subject = `managed-subject-${slug}`;
  await repo.provisionStagedTenant({
    ...provisioningInput(slug),
    users: [
      { email: ownerEmail, displayName: "Managed Owner", role: "client_owner" },
      { email: staffEmail, displayName: "Managed Staff", role: "client_staff" }
    ]
  });
  assert.deepEqual(await repo.listOidcIdentitiesByTenant(tenantId), []);

  const first = await repo.bindOidcIdentity({
    tenantId,
    email: ownerEmail.toUpperCase(),
    issuer: OIDC_ISSUER,
    subject,
    actorId: "activation-operator"
  });
  const second = await repo.bindOidcIdentity({
    tenantId,
    email: ownerEmail,
    issuer: OIDC_ISSUER,
    subject,
    actorId: "activation-operator"
  });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.identity.bindingSource, "managed-idp-admin");
  assert.equal(first.identity.userId, `${tenantId}-user-1`);
  assert.deepEqual(await repo.resolveOidcAuthorization({ issuer: OIDC_ISSUER, subject }), {
    status: "active",
    userId: `${tenantId}-user-1`,
    tenantId,
    organizationRole: "client_owner",
    projectRole: null
  });
  assert.equal(
    (await repo.listAuditEventsByTenant(tenantId)).filter((event) => event.action === "managed_idp.identity_bound").length,
    1
  );

  await assert.rejects(
    () => repo.bindOidcIdentity({
      tenantId,
      email: ownerEmail,
      issuer: OIDC_ISSUER,
      subject: `${subject}-different`,
      actorId: "activation-operator"
    }),
    (error) => error.code === "oidc_binding_conflict"
  );
  await assert.rejects(
    () => repo.bindOidcIdentity({
      tenantId,
      email: staffEmail,
      issuer: OIDC_ISSUER,
      subject,
      actorId: "activation-operator"
    }),
    (error) => error.code === "oidc_binding_conflict"
  );
  assert.equal((await repo.listOidcIdentitiesByTenant(tenantId)).length, 1);
});

test("managed IdP binding rolls back identity and audit evidence on failure", { skip }, async (t) => {
  const slug = `pg-managed-idp-rollback-${process.pid}`;
  const tenantId = `tenant-${slug}`;
  const base = createPostgresRepository({ connectionString: PG_URL, seedSyntheticData: true });
  t.after(() => base.close());
  await base.provisionStagedTenant(provisioningInput(slug));
  const auditCountBefore = (await base.listAuditEventsByTenant(tenantId)).length;

  const failing = createPostgresRepository({
    connectionString: PG_URL,
    seedSyntheticData: true,
    beforeOidcBindingCommit: async () => {
      throw new Error("forced OIDC binding failure");
    }
  });
  t.after(() => failing.close());
  await assert.rejects(
    () => failing.bindOidcIdentity({
      tenantId,
      email: `owner@${slug}.invalid`,
      issuer: OIDC_ISSUER,
      subject: `rollback-subject-${slug}`,
      actorId: "activation-operator"
    }),
    /forced OIDC binding failure/
  );
  assert.deepEqual(await base.listOidcIdentitiesByTenant(tenantId), []);
  assert.equal((await base.listAuditEventsByTenant(tenantId)).length, auditCountBefore);
});

test("postgres provisioning and portal branding/updates remain tenant-scoped", { skip }, async (t) => {
  const repo = createPostgresRepository({ connectionString: PG_URL, seedSyntheticData: true });
  t.after(() => repo.close());
  const suffix = process.pid;
  const alphaSlug = `pg-isolation-alpha-${suffix}`;
  const bravoSlug = `pg-isolation-bravo-${suffix}`;
  const alphaId = `tenant-${alphaSlug}`;
  const bravoId = `tenant-${bravoSlug}`;

  await repo.provisionStagedTenant({
    ...provisioningInput(alphaSlug),
    brandName: "Alpha Field",
    primaryColor: "#112233"
  });
  await repo.provisionStagedTenant({
    ...provisioningInput(bravoSlug),
    brandName: "Bravo Build",
    primaryColor: "#445566"
  });

  const alphaConfig = await repo.getPortalConfigurationByTenant(alphaId);
  const bravoConfig = await repo.getPortalConfigurationByTenant(bravoId);
  const alphaPortal = await repo.getPortalDataByTenant(alphaId);
  const bravoPortal = await repo.getPortalDataByTenant(bravoId);

  assert.equal(alphaConfig.brandName, "Alpha Field");
  assert.equal(bravoConfig.brandName, "Bravo Build");
  assert.match(alphaPortal.updates[0].message, /Alpha Field/);
  assert.match(bravoPortal.updates[0].message, /Bravo Build/);
  assert.ok(!alphaPortal.updates.some((update) => update.message.includes("Bravo Build")));
  assert.ok(!bravoPortal.updates.some((update) => update.message.includes("Alpha Field")));
  assert.ok((await repo.listProjectsByTenant(alphaId)).every((project) => project.tenantId === alphaId));
  assert.ok((await repo.listProjectsByTenant(bravoId)).every((project) => project.tenantId === bravoId));
  assert.ok((await repo.listUsersByTenant(alphaId)).every((user) => user.tenantId === alphaId));
  assert.ok((await repo.listUsersByTenant(bravoId)).every((user) => user.tenantId === bravoId));
});

test("postgres provisioning rolls back every canonical record on failure", { skip }, async (t) => {
  const slug = `pg-paid-client-rollback-${process.pid}`;
  const tenantId = `tenant-${slug}`;
  const failing = createPostgresRepository({
    connectionString: PG_URL,
    seedSyntheticData: true,
    beforeProvisioningCommit: async () => {
      throw new Error("forced provisioning failure");
    }
  });
  t.after(() => failing.close());

  await assert.rejects(
    () => failing.provisionStagedTenant({
      ...provisioningInput(slug),
      oidcIssuer: OIDC_ISSUER,
      users: [{
        email: `owner@${slug}.invalid`,
        displayName: `${slug} Owner`,
        role: "client_owner",
        oidcSubject: `subject-${slug}`
      }]
    }),
    /forced provisioning failure/
  );
  assert.equal(await failing.getTenantById(tenantId), null);
  assert.deepEqual(await failing.listUsersByTenant(tenantId), []);
  assert.deepEqual(await failing.listOidcIdentitiesByTenant(tenantId), []);
  assert.deepEqual(await failing.listProjectsByTenant(tenantId), []);
  assert.deepEqual(await failing.listProvisioningEventsByTenant(tenantId), []);
  assert.deepEqual(await failing.listAuditEventsByTenant(tenantId), []);
});
