import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import { AuthError, verifyJwt } from "../src/auth/jwt.js";
import { assertAuthConfig, loadAuthConfig } from "../src/auth/config.js";
import { createRemoteJwks, createStaticJwks } from "../src/auth/jwks.js";
import { resolveOidcPrincipal, resolvePrincipal, resolveStagedPrincipal } from "../src/auth/principal.js";
import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { POSTGRES_MIGRATIONS } from "../src/repositories/postgres-migrations.js";

test("OIDC authorization migration is registered for every Postgres environment", () => {
  assert.deepEqual(
    POSTGRES_MIGRATIONS.map(({ version }) => version),
    ["0001_init", "0002_paid_client_provisioning", "0003_oidc_authorization"]
  );
});

// --- Test key material + JWT signer (RS256) ----------------------------------

const KID = "test-key-1";
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, use: "sig", alg: "RS256" };
const KEYS = [jwk];

const ISSUER = "https://issuer.example.com/";
const AUDIENCE = "xygo-api";
const TEST_ALG_TO_HASH = {
  RS256: "RSA-SHA256",
  RS384: "RSA-SHA384",
  RS512: "RSA-SHA512"
};

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function signJwt(claims, { kid = KID, alg = "RS256" } = {}) {
  const signingInput = `${b64url({ alg, kid, typ: "JWT" })}.${b64url(claims)}`;
  const signature = crypto.sign(TEST_ALG_TO_HASH[alg] ?? "RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

const nowSec = 1_800_000_000;
const now = nowSec * 1000;

function baseClaims(overrides = {}) {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: "user-123",
    exp: nowSec + 3600,
    iat: nowSec - 10,
    org_id: "tenant-commercial-sim",
    "https://xygo/org_role": "company_admin",
    ...overrides
  };
}

const oidcConfig = {
  mode: "oidc",
  oidc: {
    issuer: ISSUER,
    audience: AUDIENCE,
    allowedAlgorithms: ["RS256"],
    clockToleranceSec: 60
  }
};

function canonicalAuthorization(overrides = {}) {
  return {
    async resolveOidcAuthorization({ issuer, subject }) {
      assert.equal(issuer, ISSUER);
      assert.equal(subject, "user-123");
      return {
        status: "active",
        userId: "canonical-user-7",
        tenantId: "tenant-canonical",
        organizationRole: "client_owner",
        projectRole: null,
        ...overrides
      };
    }
  };
}

// --- verifyJwt ----------------------------------------------------------------

test("verifyJwt accepts a valid signed token", () => {
  const claims = verifyJwt(signJwt(baseClaims()), { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now });
  assert.equal(claims.sub, "user-123");
  assert.equal(claims.org_id, "tenant-commercial-sim");
});

test("verifyJwt rejects an expired token", () => {
  const token = signJwt(baseClaims({ exp: nowSec - 3600 }));
  assert.throws(() => verifyJwt(token, { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now }), (e) => e instanceof AuthError && e.code === "token_expired");
});

test("verifyJwt requires a numeric expiration and valid clock settings", () => {
  assert.throws(
    () => verifyJwt(signJwt(baseClaims({ exp: undefined })), { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now }),
    (e) => e.code === "invalid_expiration"
  );
  assert.throws(
    () => verifyJwt(signJwt(baseClaims({ exp: "never" })), { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now }),
    (e) => e.code === "invalid_expiration"
  );
  assert.throws(
    () => verifyJwt(signJwt(baseClaims()), { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now, clockToleranceSec: Number.NaN }),
    (e) => e.code === "verification_config"
  );
});

test("verifyJwt rejects a tampered payload (bad signature)", () => {
  const token = signJwt(baseClaims());
  const [h, , s] = token.split(".");
  const forged = `${h}.${b64url(baseClaims({ org_id: "tenant-residential-sim" }))}.${s}`;
  assert.throws(() => verifyJwt(forged, { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now }), (e) => e.code === "bad_signature");
});

test("verifyJwt rejects wrong audience and wrong issuer", () => {
  assert.throws(() => verifyJwt(signJwt(baseClaims()), { keys: KEYS, issuer: ISSUER, audience: "other", now }), (e) => e.code === "audience_mismatch");
  assert.throws(() => verifyJwt(signJwt(baseClaims()), { keys: KEYS, issuer: "https://evil/", audience: AUDIENCE, now }), (e) => e.code === "issuer_mismatch");
});

test("verifyJwt rejects unsigned and non-allowlisted algorithms", () => {
  const unsigned = `${b64url({ alg: "none", kid: KID })}.${b64url(baseClaims())}.`;
  assert.throws(
    () => verifyJwt(unsigned, { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now }),
    (e) => e.code === "unsupported_alg"
  );
  assert.throws(
    () => verifyJwt(signJwt(baseClaims(), { alg: "RS512" }), { keys: [{ ...jwk, alg: "RS512" }], issuer: ISSUER, audience: AUDIENCE, now }),
    (e) => e.code === "disallowed_alg"
  );
});

test("verifyJwt rejects an unknown key id", () => {
  const token = signJwt(baseClaims(), { kid: "unknown" });
  assert.throws(() => verifyJwt(token, { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now }), (e) => e.code === "unknown_key");
  const missingKidInput = `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(baseClaims())}`;
  const missingKidSignature = crypto.sign("RSA-SHA256", Buffer.from(missingKidInput), privateKey).toString("base64url");
  const missingKid = `${missingKidInput}.${missingKidSignature}`;
  assert.throws(
    () => verifyJwt(missingKid, { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now }),
    (e) => e.code === "missing_key_id"
  );
});

test("verifyJwt enforces JWKS signing metadata", () => {
  assert.throws(
    () => verifyJwt(signJwt(baseClaims()), { keys: [{ ...jwk, use: "enc" }], issuer: ISSUER, audience: AUDIENCE, now }),
    (e) => e.code === "invalid_key"
  );
  assert.throws(
    () => verifyJwt(signJwt(baseClaims(), { alg: "RS512" }), {
      keys: KEYS,
      issuer: ISSUER,
      audience: AUDIENCE,
      allowedAlgorithms: ["RS512"],
      now
    }),
    (e) => e.code === "key_alg_mismatch"
  );
});

test("verifyJwt rejects a malformed token", () => {
  assert.throws(() => verifyJwt("not-a-jwt", { keys: KEYS, now }), (e) => e.code === "malformed_token");
  const nonObjectHeader = `${b64url(null)}.${b64url(baseClaims())}.invalid`;
  assert.throws(
    () => verifyJwt(nonObjectHeader, { keys: KEYS, issuer: ISSUER, audience: AUDIENCE, now }),
    (e) => e.code === "malformed_token"
  );
});

test("remote JWKS rejects malformed and empty responses", async () => {
  const malformed = createRemoteJwks({
    jwksUri: "https://issuer.example.com/.well-known/jwks.json",
    fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError("bad json"); } })
  });
  await assert.rejects(() => malformed.getKeys(), (e) => e.code === "jwks_invalid");

  const empty = createRemoteJwks({
    jwksUri: "https://issuer.example.com/.well-known/jwks.json",
    fetchImpl: async () => ({ ok: true, json: async () => ({ keys: [] }) })
  });
  await assert.rejects(() => empty.getKeys(), (e) => e.code === "jwks_empty");
});

// --- principal resolution -----------------------------------------------------

test("resolveOidcPrincipal derives tenant and role from the canonical repository", async () => {
  const jwks = createStaticJwks(KEYS);
  const principal = await resolveOidcPrincipal({
    headers: { authorization: `Bearer ${signJwt(baseClaims())}` },
    jwks,
    config: oidcConfig,
    repository: canonicalAuthorization(),
    now
  });
  assert.equal(principal.authenticated, true);
  assert.equal(principal.staged, false);
  assert.equal(principal.tenantId, "tenant-canonical");
  assert.equal(principal.userId, "canonical-user-7");
  assert.equal(principal.organizationRole, "client_owner");
});

test("resolveOidcPrincipal rejects a token missing the subject claim", async () => {
  const jwks = createStaticJwks(KEYS);
  const token = signJwt(baseClaims({ sub: undefined }));
  await assert.rejects(
    () => resolveOidcPrincipal({
      headers: { authorization: `Bearer ${token}` },
      jwks,
      config: oidcConfig,
      repository: canonicalAuthorization(),
      now
    }),
    (e) => e.code === "missing_subject"
  );
});

test("resolveOidcPrincipal rejects identities without an active canonical assignment", async () => {
  const jwks = createStaticJwks(KEYS);
  await assert.rejects(
    () => resolveOidcPrincipal({
      headers: { authorization: `Bearer ${signJwt(baseClaims())}` },
      jwks,
      config: oidcConfig,
      repository: canonicalAuthorization({ status: "not_found" }),
      now
    }),
    (e) => e.code === "identity_not_provisioned"
  );

  await assert.rejects(
    () => resolveOidcPrincipal({
      headers: { authorization: `Bearer ${signJwt(baseClaims())}` },
      jwks,
      config: oidcConfig,
      repository: canonicalAuthorization({ organizationRole: "token-supplied-admin" }),
      now
    }),
    (e) => e.code === "identity_invalid"
  );
});

test("resolveOidcPrincipal requires a bearer token", async () => {
  const jwks = createStaticJwks(KEYS);
  await assert.rejects(
    () => resolveOidcPrincipal({ headers: {}, jwks, config: oidcConfig, repository: canonicalAuthorization(), now }),
    (e) => e.code === "missing_token"
  );
});

test("query-string identity is restricted to the SSE auth path", async () => {
  const searchParams = new URLSearchParams({ access_token: signJwt(baseClaims()) });
  const input = {
    searchParams,
    jwks: createStaticJwks(KEYS),
    config: oidcConfig,
    repository: canonicalAuthorization(),
    now
  };

  await assert.rejects(() => resolvePrincipal(input), (e) => e.code === "missing_token");
  const principal = await resolvePrincipal({ ...input, allowQueryAuth: true });
  assert.equal(principal.tenantId, "tenant-canonical");

  const stagedWithoutSse = await resolvePrincipal({
    config: { mode: "staged" },
    searchParams: new URLSearchParams({ stagedTenantId: "tenant-query" })
  });
  assert.equal(stagedWithoutSse.tenantId, null);
});

test("OIDC startup requires the canonical Postgres repository", () => {
  const config = loadAuthConfig({
    XYGO_AUTH_MODE: "oidc",
    XYGO_OIDC_ISSUER: ISSUER,
    XYGO_OIDC_AUDIENCE: AUDIENCE
  });
  assert.throws(
    () => assertAuthConfig(config, { repositoryMode: "sqlite" }),
    (error) => error instanceof AuthError && error.code === "unsafe_config"
  );
  assert.doesNotThrow(() => assertAuthConfig(config, { repositoryMode: "postgres" }));
});

test("production auth configuration fails closed", () => {
  const stagedProduction = loadAuthConfig({ NODE_ENV: "production" });
  assert.throws(
    () => assertAuthConfig(stagedProduction, { repositoryMode: "postgres" }),
    (error) => error instanceof AuthError && error.code === "unsafe_config"
  );

  const explicitlyNonStaged = loadAuthConfig({ STAGED_MODE: "false" });
  assert.throws(
    () => assertAuthConfig(explicitlyNonStaged, { repositoryMode: "postgres" }),
    (error) => error.code === "unsafe_config"
  );

  const insecureIssuer = loadAuthConfig({
    NODE_ENV: "production",
    XYGO_AUTH_MODE: "oidc",
    XYGO_OIDC_ISSUER: "http://issuer.example.com/",
    XYGO_OIDC_AUDIENCE: AUDIENCE
  });
  assert.throws(
    () => assertAuthConfig(insecureIssuer, { repositoryMode: "postgres" }),
    (error) => error.code === "unsafe_config"
  );

  const insecureJwks = loadAuthConfig({
    NODE_ENV: "production",
    XYGO_AUTH_MODE: "oidc",
    XYGO_OIDC_ISSUER: ISSUER,
    XYGO_OIDC_AUDIENCE: AUDIENCE,
    XYGO_OIDC_JWKS_URI: "http://keys.example.com/jwks.json"
  });
  assert.throws(
    () => assertAuthConfig(insecureJwks, { repositoryMode: "postgres" }),
    (error) => error.code === "unsafe_config"
  );

  const secureProduction = loadAuthConfig({
    NODE_ENV: "production",
    STAGED_MODE: "false",
    XYGO_AUTH_MODE: "oidc",
    XYGO_OIDC_ISSUER: ISSUER,
    XYGO_OIDC_AUDIENCE: AUDIENCE
  });
  assert.doesNotThrow(() => assertAuthConfig(secureProduction, { repositoryMode: "postgres" }));
});

test("OIDC startup rejects unsafe verification settings", () => {
  const invalidClock = loadAuthConfig({
    XYGO_AUTH_MODE: "oidc",
    XYGO_OIDC_ISSUER: ISSUER,
    XYGO_OIDC_AUDIENCE: AUDIENCE,
    XYGO_OIDC_CLOCK_TOLERANCE_SEC: "not-a-number"
  });
  assert.throws(
    () => assertAuthConfig(invalidClock, { repositoryMode: "postgres" }),
    (error) => error.code === "config_error"
  );

  const invalidAlgorithms = loadAuthConfig({
    XYGO_AUTH_MODE: "oidc",
    XYGO_OIDC_ISSUER: ISSUER,
    XYGO_OIDC_AUDIENCE: AUDIENCE,
    XYGO_OIDC_ALLOWED_ALGORITHMS: "HS256"
  });
  assert.throws(
    () => assertAuthConfig(invalidAlgorithms, { repositoryMode: "postgres" }),
    (error) => error.code === "config_error"
  );
});

test("resolveStagedPrincipal self-asserts tenant and defaults the role", () => {
  const p = resolveStagedPrincipal({ headers: { "x-staged-tenant-id": "tenant-x", "x-staged-user-id": "u1" } });
  assert.equal(p.tenantId, "tenant-x");
  assert.equal(p.userId, "u1");
  assert.equal(p.organizationRole, "company_admin");
  assert.equal(p.staged, true);
  assert.equal(p.authenticated, false);
});

// --- route-level RBAC (principal injected) -----------------------------------

async function request({ method, path, principal, body }) {
  return handleApiRequest({
    method,
    path,
    body: body ? JSON.stringify(body) : null,
    repository: createMemoryRepository(),
    principal,
    authConfig: oidcConfig
  });
}

const T = "tenant-commercial-sim";

test("RBAC: read_only_auditor can read but cannot create", async () => {
  const auditor = { userId: "a", tenantId: T, organizationRole: "read_only_auditor", projectRole: null, authenticated: true, staged: false };

  assert.equal((await request({ method: "GET", path: `/v1/tenants/${T}/projects`, principal: auditor })).status, 200);

  const create = await request({
    method: "POST",
    path: `/v1/tenants/${T}/issues`,
    principal: auditor,
    body: { id: "i1", projectId: "project-commercial-b", title: "t", description: "d" }
  });
  assert.equal(create.status, 403);
  assert.match(create.body.message, /role_denied/);
});

test("RBAC: company_admin can create in-tenant", async () => {
  const admin = { userId: "a", tenantId: T, organizationRole: "company_admin", projectRole: null, authenticated: true, staged: false };
  const create = await request({
    method: "POST",
    path: `/v1/tenants/${T}/issues`,
    principal: admin,
    body: { id: "i1", projectId: "project-commercial-b", title: "t", description: "d" }
  });
  assert.equal(create.status, 201);
});

test("paid-client staff can capture reports while viewers remain read-only", async () => {
  const staff = {
    userId: "staff-1",
    tenantId: T,
    organizationRole: "client_staff",
    projectRole: null,
    authenticated: true,
    staged: false
  };
  const viewer = { ...staff, userId: "viewer-1", organizationRole: "client_viewer" };
  const body = {
    id: "fr-paid-auth",
    projectId: "project-commercial-b",
    siteName: "Paid auth test",
    reportType: "daily_log",
    author: staff.userId,
    observations: [{ kind: "note", text: "Verified staff capture" }]
  };

  const staffCreate = await request({
    method: "POST",
    path: `/v1/tenants/${T}/field-reports`,
    principal: staff,
    body
  });
  assert.equal(staffCreate.status, 201);

  const viewerCreate = await request({
    method: "POST",
    path: `/v1/tenants/${T}/field-reports`,
    principal: viewer,
    body: { ...body, id: "fr-paid-viewer" }
  });
  assert.equal(viewerCreate.status, 403);

  const viewerPortal = await request({
    method: "GET",
    path: `/v1/tenants/${T}/client-portal`,
    principal: viewer
  });
  assert.equal(viewerPortal.status, 200);

  const viewerReports = await request({
    method: "GET",
    path: `/v1/tenants/${T}/field-reports`,
    principal: viewer
  });
  assert.equal(viewerReports.status, 403);
});

test("paid-client principals cannot cross tenant boundaries", async () => {
  for (const organizationRole of ["xygo_admin", "client_owner", "client_staff", "client_viewer"]) {
    const principal = {
      userId: `${organizationRole}-1`,
      tenantId: T,
      organizationRole,
      projectRole: null,
      authenticated: true,
      staged: false
    };
    assert.equal((await request({ method: "GET", path: `/v1/tenants/${T}/projects`, principal })).status, 200);
    assert.equal((await request({ method: "GET", path: `/v1/tenants/${T}/client-portal`, principal })).status, 200);
    assert.equal(
      (await request({ method: "GET", path: "/v1/tenants/tenant-residential-sim/projects", principal })).status,
      403
    );
    assert.equal(
      (await request({ method: "GET", path: "/v1/tenants/tenant-residential-sim/client-portal", principal })).status,
      403
    );
  }
});

test("paid-client field report creation requires an in-tenant project", async () => {
  const staff = {
    userId: "staff-cross-project",
    tenantId: T,
    organizationRole: "client_staff",
    projectRole: null,
    authenticated: true,
    staged: false
  };
  const response = await request({
    method: "POST",
    path: `/v1/tenants/${T}/field-reports`,
    principal: staff,
    body: {
      id: "fr-cross-project",
      projectId: "project-residential-a",
      siteName: "Wrong tenant",
      reportType: "daily_log",
      author: staff.userId,
      observations: []
    }
  });
  assert.equal(response.status, 403);
  assert.match(response.body.message, /in-tenant project/);
});

test("RBAC: principal from another tenant is denied (no cross-tenant)", async () => {
  const other = { userId: "a", tenantId: "tenant-residential-sim", organizationRole: "company_admin", projectRole: null, authenticated: true, staged: false };
  assert.equal((await request({ method: "GET", path: `/v1/tenants/${T}/projects`, principal: other })).status, 403);
});

test("OIDC mode with no principal is unauthorized (401)", async () => {
  const res = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${T}/projects`,
    repository: createMemoryRepository(),
    principal: null,
    authConfig: oidcConfig
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "unauthorized");
});

test("OIDC mode ignores self-asserted staged headers", async () => {
  // In OIDC mode a raw x-staged-tenant-id header must NOT grant access.
  const res = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${T}/projects`,
    headers: { "x-staged-tenant-id": T },
    repository: createMemoryRepository(),
    principal: null,
    authConfig: oidcConfig
  });
  assert.equal(res.status, 401);
});
