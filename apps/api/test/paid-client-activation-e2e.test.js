import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import { createStaticJwks } from "../src/auth/jwks.js";
import { createPostgresRepository } from "../src/repositories/postgres.js";
import { createServer } from "../src/server.js";

const PG_URL = process.env.XYGO_TEST_PG_URL;
const requirePostgres = process.env.XYGO_REQUIRE_PG_TESTS === "true";
if (requirePostgres && !PG_URL) {
  throw new Error("XYGO_REQUIRE_PG_TESTS=true requires XYGO_TEST_PG_URL; refusing to skip the activation E2E test.");
}
const skip = PG_URL ? false : "set XYGO_TEST_PG_URL to run the paid-client activation E2E test";

const OIDC_ISSUER = "https://issuer.activation-e2e.test/";
const OIDC_AUDIENCE = "xygo-api";
const OIDC_KID = "activation-e2e-key";
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: OIDC_KID,
  use: "sig",
  alg: "RS256"
};

function signToken(subject, extraClaims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: OIDC_KID, typ: "JWT" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: OIDC_ISSUER,
    aud: OIDC_AUDIENCE,
    sub: subject,
    iat: now - 10,
    exp: now + 3600,
    ...extraClaims
  })).toString("base64url");
  const input = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url");
  return `${input}.${signature}`;
}

function provisioningInput({ slug, businessName, brandName, primaryColor, subjects }) {
  return {
    staged: true,
    slug,
    businessName,
    projectName: `${businessName} Starter Project`,
    brandName,
    primaryColor,
    oidcIssuer: OIDC_ISSUER,
    users: [
      {
        email: `owner@${slug}.invalid`,
        displayName: `${businessName} Owner`,
        role: "client_owner",
        oidcSubject: subjects.owner
      },
      {
        email: `staff@${slug}.invalid`,
        displayName: `${businessName} Staff`,
        role: "client_staff",
        oidcSubject: subjects.staff
      },
      {
        email: `viewer@${slug}.invalid`,
        displayName: `${businessName} Viewer`,
        role: "client_viewer",
        oidcSubject: subjects.viewer
      }
    ]
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("paid-client activation works end to end through OIDC, HTTP, and canonical Postgres", { skip }, async (t) => {
  const nonce = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const alphaSlug = `activation-alpha-${nonce}`;
  const betaSlug = `activation-beta-${nonce}`;
  const alphaTenantId = `tenant-${alphaSlug}`;
  const betaTenantId = `tenant-${betaSlug}`;
  const alphaSubjects = {
    owner: `alpha-owner-${nonce}`,
    staff: `alpha-staff-${nonce}`,
    viewer: `alpha-viewer-${nonce}`
  };
  const betaSubjects = {
    owner: `beta-owner-${nonce}`,
    staff: `beta-staff-${nonce}`,
    viewer: `beta-viewer-${nonce}`
  };

  const repository = createPostgresRepository({ connectionString: PG_URL });
  const pg = (await import("pg")).default;
  const adminPool = new pg.Pool({ connectionString: PG_URL });
  let server = null;
  t.after(async () => {
    if (server?.listening) {
      await closeServer(server);
    }
    await repository.close();
    await adminPool.end();
  });

  const alpha = await repository.provisionStagedTenant(provisioningInput({
    slug: alphaSlug,
    businessName: "Atlas Field Operations",
    brandName: "Atlas Client Portal",
    primaryColor: "#123456",
    subjects: alphaSubjects
  }));
  await repository.provisionStagedTenant(provisioningInput({
    slug: betaSlug,
    businessName: "Beacon Builders",
    brandName: "Beacon Project Hub",
    primaryColor: "#654321",
    subjects: betaSubjects
  }));

  server = createServer({
    env: {
      NODE_ENV: "production",
      STAGED_MODE: "false",
      XYGO_AUTH_MODE: "oidc",
      XYGO_API_REPOSITORY_MODE: "postgres",
      XYGO_API_PG_URL: PG_URL,
      XYGO_OIDC_ISSUER: OIDC_ISSUER,
      XYGO_OIDC_AUDIENCE: OIDC_AUDIENCE,
      XYGO_OIDC_JWKS_URI: "https://issuer.activation-e2e.test/.well-known/jwks.json"
    },
    repository,
    jwks: createStaticJwks([publicJwk]),
    logger: { info() {} }
  });
  const address = await listen(server);
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(path, { token, headers = {}, method = "GET", body } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, body: await response.json() };
  }

  const noAuth = await request(`/v1/tenants/${alphaTenantId}/projects`);
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.body.code, "missing_token");

  const stagedHeadersOnly = await request(`/v1/tenants/${alphaTenantId}/projects`, {
    headers: {
      "x-staged-tenant-id": alphaTenantId,
      "x-staged-user-id": "staged-user"
    }
  });
  assert.equal(stagedHeadersOnly.status, 401);
  assert.equal(stagedHeadersOnly.body.code, "missing_token");

  const staffToken = signToken(alphaSubjects.staff, {
    org_id: betaTenantId,
    "https://xygo/org_role": "xygo_admin"
  });
  const ownProjects = await request(`/v1/tenants/${alphaTenantId}/projects`, { token: staffToken });
  assert.equal(ownProjects.status, 200);
  assert.deepEqual(ownProjects.body.items.map((project) => project.id), [alpha.project.id]);
  assert.ok(ownProjects.body.items.every((project) => project.tenantId === alphaTenantId));

  const crossTenantProjects = await request(`/v1/tenants/${betaTenantId}/projects`, { token: staffToken });
  assert.equal(crossTenantProjects.status, 403);

  const reportId = `${alphaTenantId}-e2e-report`;
  const fieldReport = await request(`/v1/tenants/${alphaTenantId}/field-reports`, {
    method: "POST",
    token: staffToken,
    body: {
      id: reportId,
      projectId: alpha.project.id,
      siteName: "Atlas Site",
      reportType: "daily_log",
      author: "Atlas Staff",
      observations: [{ kind: "note", text: "E2E activation verified." }]
    }
  });
  assert.equal(fieldReport.status, 201);
  assert.equal(fieldReport.body.item.tenantId, alphaTenantId);

  const viewerToken = signToken(alphaSubjects.viewer, {
    org_id: betaTenantId,
    "https://xygo/org_role": "xygo_admin"
  });
  const viewerWrite = await request(`/v1/tenants/${alphaTenantId}/field-reports`, {
    method: "POST",
    token: viewerToken,
    body: {
      id: `${reportId}-viewer`,
      projectId: alpha.project.id,
      siteName: "Atlas Site",
      reportType: "daily_log",
      author: "Atlas Viewer"
    }
  });
  assert.equal(viewerWrite.status, 403);

  const alphaPortal = await request(`/v1/tenants/${alphaTenantId}/client-portal`, { token: viewerToken });
  assert.equal(alphaPortal.status, 200);
  assert.equal(alphaPortal.body.configuration.brandName, "Atlas Client Portal");
  assert.equal(alphaPortal.body.configuration.primaryColor, "#123456");
  assert.match(alphaPortal.body.welcomeMessage, /Atlas Client Portal/);
  assert.ok(alphaPortal.body.items[0].updates.some((update) => /Atlas Client Portal staged portal provisioned/.test(update.message)));
  assert.ok(alphaPortal.body.items.every((project) => project.tenantId === alphaTenantId));

  const crossTenantPortal = await request(`/v1/tenants/${betaTenantId}/client-portal`, { token: viewerToken });
  assert.equal(crossTenantPortal.status, 403);

  const betaPortal = await request(`/v1/tenants/${betaTenantId}/client-portal`, {
    token: signToken(betaSubjects.viewer)
  });
  assert.equal(betaPortal.status, 200);
  assert.equal(betaPortal.body.configuration.brandName, "Beacon Project Hub");
  assert.ok(betaPortal.body.items[0].updates.some((update) => /Beacon Project Hub staged portal provisioned/.test(update.message)));
  assert.ok(betaPortal.body.items.every((project) => project.tenantId === betaTenantId));
  assert.ok(betaPortal.body.items.every((project) => !project.updates.some((update) => /Atlas Client Portal/.test(update.message))));

  const audit = await request(`/v1/tenants/${alphaTenantId}/audit-events`, {
    token: signToken(alphaSubjects.owner)
  });
  assert.equal(audit.status, 200);
  assert.ok(audit.body.items.some((event) => event.action === "staged_tenant.provisioned"));
  assert.ok(audit.body.items.some((event) => event.action === "api.field_report.created"));
  const provisioningEvents = await repository.listProvisioningEventsByTenant(alphaTenantId);
  assert.equal(provisioningEvents.length, 1);
  assert.equal(provisioningEvents[0].action, "staged_tenant.provisioned");

  const alphaUsers = await repository.listUsersByTenant(alphaTenantId);
  const inactiveViewer = alphaUsers.find((user) => user.email === `viewer@${alphaSlug}.invalid`);
  assert.ok(inactiveViewer);
  await adminPool.query("UPDATE users SET status = 'inactive' WHERE id = $1", [inactiveViewer.id]);
  const inactiveIdentity = await request(`/v1/tenants/${alphaTenantId}/projects`, { token: viewerToken });
  assert.equal(inactiveIdentity.status, 401);
  assert.equal(inactiveIdentity.body.code, "identity_not_provisioned");
});
