import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import { AuthError, verifyJwt } from "../src/auth/jwt.js";
import { createStaticJwks } from "../src/auth/jwks.js";
import { resolveOidcPrincipal, resolveStagedPrincipal } from "../src/auth/principal.js";
import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

// --- Test key material + JWT signer (RS256) ----------------------------------

const KID = "test-key-1";
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, use: "sig", alg: "RS256" };
const KEYS = [jwk];

const ISSUER = "https://issuer.example.com/";
const AUDIENCE = "xygo-api";

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function signJwt(claims, { kid = KID, alg = "RS256" } = {}) {
  const signingInput = `${b64url({ alg, kid, typ: "JWT" })}.${b64url(claims)}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey).toString("base64url");
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
    tenantClaim: "org_id",
    rolesClaim: "https://xygo/org_role",
    projectRoleClaim: "https://xygo/project_role",
    clockToleranceSec: 60
  }
};

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

test("verifyJwt rejects an unknown key id", () => {
  const token = signJwt(baseClaims(), { kid: "unknown" });
  const twoKeys = [jwk, { ...jwk, kid: "other" }];
  assert.throws(() => verifyJwt(token, { keys: twoKeys, issuer: ISSUER, audience: AUDIENCE, now }), (e) => e.code === "unknown_key");
});

test("verifyJwt rejects a malformed token", () => {
  assert.throws(() => verifyJwt("not-a-jwt", { keys: KEYS, now }), (e) => e.code === "malformed_token");
});

// --- principal resolution -----------------------------------------------------

test("resolveOidcPrincipal maps verified claims to a principal", async () => {
  const jwks = createStaticJwks(KEYS);
  const principal = await resolveOidcPrincipal({
    headers: { authorization: `Bearer ${signJwt(baseClaims())}` },
    jwks,
    config: oidcConfig,
    now
  });
  assert.equal(principal.authenticated, true);
  assert.equal(principal.staged, false);
  assert.equal(principal.tenantId, "tenant-commercial-sim");
  assert.equal(principal.userId, "user-123");
  assert.equal(principal.organizationRole, "company_admin");
});

test("resolveOidcPrincipal rejects a token missing the tenant claim", async () => {
  const jwks = createStaticJwks(KEYS);
  const token = signJwt(baseClaims({ org_id: undefined }));
  await assert.rejects(
    () => resolveOidcPrincipal({ headers: { authorization: `Bearer ${token}` }, jwks, config: oidcConfig, now }),
    (e) => e.code === "missing_tenant_claim"
  );
});

test("resolveOidcPrincipal requires a bearer token", async () => {
  const jwks = createStaticJwks(KEYS);
  await assert.rejects(
    () => resolveOidcPrincipal({ headers: {}, jwks, config: oidcConfig, now }),
    (e) => e.code === "missing_token"
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
