import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import { createStaticJwks } from "../src/auth/jwks.js";
import { resolveOidcPrincipal } from "../src/auth/principal.js";
import { handleApiRequest } from "../src/handlers.js";
import { createPostgresRepository } from "../src/repositories/postgres.js";

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
    "oidc_identities",
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
    "0003_oidc_authorization"
  ]);
});

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
  const repo = createPostgresRepository({ connectionString: PG_URL });
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
  const repo = createPostgresRepository({ connectionString: PG_URL });
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

test("postgres provisioning and portal branding/updates remain tenant-scoped", { skip }, async (t) => {
  const repo = createPostgresRepository({ connectionString: PG_URL });
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
