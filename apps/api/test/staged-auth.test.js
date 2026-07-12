import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { canAccessTenant, extractStagedAuth } from "../src/staged-auth.js";
import { canStreamTenantEvents } from "../src/realtime.js";
import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

const TENANT_A = "tenant-commercial-sim";
const TENANT_B = "tenant-residential-sim";

// --- Shared helper unit coverage ---------------------------------------------

test("extractStagedAuth reads the lowercase and title-case tenant header", async () => {
  assert.equal(extractStagedAuth({ headers: { "x-staged-tenant-id": TENANT_A } }).tenantId, TENANT_A);
  assert.equal(extractStagedAuth({ headers: { "X-Staged-Tenant-Id": TENANT_A } }).tenantId, TENANT_A);
});

test("extractStagedAuth defaults the actor id and reads it when supplied", async () => {
  assert.equal(extractStagedAuth({ headers: {} }).userId, "synthetic-user");
  assert.equal(
    extractStagedAuth({ headers: { "x-staged-user-id": "user-commercial-admin" } }).userId,
    "user-commercial-admin"
  );
});

test("extractStagedAuth only reads the query param when searchParams is provided", async () => {
  const searchParams = new URLSearchParams({ stagedTenantId: TENANT_A });

  // SSE transport passes searchParams -> query param is honored.
  assert.equal(extractStagedAuth({ headers: {}, searchParams }).tenantId, TENANT_A);
  // REST call sites pass no searchParams -> query param is ignored (cannot broaden access).
  assert.equal(extractStagedAuth({ headers: {} }).tenantId, null);
});

test("canAccessTenant matches asserted tenant to requested tenant", async () => {
  assert.equal(canAccessTenant({ headers: { "x-staged-tenant-id": TENANT_A }, tenantId: TENANT_A }), true);
  assert.equal(canAccessTenant({ headers: { "x-staged-tenant-id": TENANT_A }, tenantId: TENANT_B }), false);
  assert.equal(canAccessTenant({ headers: {}, tenantId: TENANT_A }), false);
});

test("REST access ignores the query param while the SSE stream honors it", async () => {
  const searchParams = new URLSearchParams({ stagedTenantId: TENANT_A });

  // REST (no searchParams): a query param cannot grant access.
  assert.equal(canAccessTenant({ headers: {}, tenantId: TENANT_A }), false);
  // SSE (searchParams): the query param grants access, matching runtime behavior.
  assert.equal(canStreamTenantEvents({ headers: {}, searchParams, tenantId: TENANT_A }), true);
  assert.equal(canStreamTenantEvents({ headers: {}, searchParams, tenantId: TENANT_B }), false);
});

// --- Activation gate ----------------------------------------------------------
// These tests intentionally pin the *insecure-by-design* staged behavior so it
// cannot silently graduate to production. If real tenant auth is added, update
// these expectations deliberately (and check the activation-checklist item).

test("ACTIVATION GATE: tenant access is self-asserted with no credential", async () => {
  const repository = createMemoryRepository();

  // A caller reaches tenant A by simply asserting tenant A's id -- no token.
  const asA = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${TENANT_A}/projects`,
    headers: { "x-staged-tenant-id": TENANT_A },
    repository
  });
  assert.equal(asA.status, 200);

  // The SAME caller can freely reach tenant B just by changing the asserted id.
  // This is the documented isolation hole; it is only acceptable for staged data.
  const asB = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${TENANT_B}/projects`,
    headers: { "x-staged-tenant-id": TENANT_B },
    repository
  });
  assert.equal(asB.status, 200);

  // The only thing enforced is header/path agreement.
  const mismatch = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${TENANT_A}/projects`,
    headers: { "x-staged-tenant-id": TENANT_B },
    repository
  });
  assert.equal(mismatch.status, 403);

  // Absent assertion is denied (fail closed on missing scope).
  const missing = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${TENANT_A}/projects`,
    headers: {},
    repository
  });
  assert.equal(missing.status, 403);
});

test("ACTIVATION GATE: tenant isolation checklist item stays unchecked while auth is self-asserted", async () => {
  const checklistPath = path.resolve(process.cwd(), "docs/activation/activation-checklist.md");
  const checklist = fs.readFileSync(checklistPath, "utf8");

  const line = checklist
    .split("\n")
    .find((entry) => entry.toLowerCase().includes("tenant isolation verification completed"));

  assert.ok(line, "activation checklist must track tenant isolation verification");

  // The staged API grants access purely on a self-asserted header
  // (apps/api/src/staged-auth.js). Until that is replaced with real authn/authz,
  // this checklist item MUST remain unchecked. If you are checking it, first
  // remove the self-asserted model and update this gate on purpose.
  assert.ok(
    /^- \[ \]/.test(line.trim()),
    "tenant isolation checklist item is checked, but the API still uses self-asserted, " +
      "unauthenticated tenant scope (apps/api/src/staged-auth.js). Implement real tenant " +
      "auth before checking this item."
  );
});
