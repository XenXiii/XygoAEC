import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

const A = "tenant-commercial-sim";
const B = "tenant-residential-sim";

function intakeBody(overrides = {}) {
  return JSON.stringify({
    id: "bp-new",
    businessName: "Acme Field Services",
    industry: "field_services",
    painPoints: ["manual field reports", "clients call for status"],
    aiAgentRequirements: ["AI receptionist"],
    integrationNeeds: ["QuickBooks"],
    ...overrides
  });
}

test("create generates a staged blueprint with modules + build steps", async () => {
  const repository = createMemoryRepository();
  const res = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${A}/platform-blueprints`,
    headers: { "x-staged-tenant-id": A },
    body: intakeBody(),
    repository
  });

  assert.equal(res.status, 201);
  const bp = res.body.item;
  assert.equal(bp.id, "bp-new");
  assert.equal(bp.tenantId, A);
  assert.ok(bp.recommendedModules.length > 0);
  assert.ok(bp.nextBuildSteps.length > 0);
  assert.equal(bp.staged, true);
  assert.equal(bp.integrationSpec.status, "staged_mock_only");
});

test("create writes a platform_blueprint audit event", async () => {
  const repository = createMemoryRepository();
  await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${A}/platform-blueprints`,
    headers: { "x-staged-tenant-id": A },
    body: intakeBody({ id: "bp-audit" }),
    repository
  });

  const audit = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${A}/audit-events`,
    headers: { "x-staged-tenant-id": A },
    repository
  });
  assert.ok(
    audit.body.items.some(
      (event) => event.action === "api.platform_blueprint.created" && event.resourceId === "bp-audit"
    )
  );
});

test("blueprints are tenant-isolated on list and read", async () => {
  const repository = createMemoryRepository();
  await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${A}/platform-blueprints`,
    headers: { "x-staged-tenant-id": A },
    body: intakeBody({ id: "bp-iso" }),
    repository
  });

  const listB = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${B}/platform-blueprints`,
    headers: { "x-staged-tenant-id": B },
    repository
  });
  assert.ok(!listB.body.items.some((bp) => bp.id === "bp-iso"));

  const readCrossTenant = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${B}/platform-blueprints/bp-iso`,
    headers: { "x-staged-tenant-id": B },
    repository
  });
  assert.equal(readCrossTenant.status, 404);
});

test("validation rejects missing fields and unknown industry", async () => {
  const repository = createMemoryRepository();

  const missing = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${A}/platform-blueprints`,
    headers: { "x-staged-tenant-id": A },
    body: JSON.stringify({ id: "bp-bad" }),
    repository
  });
  assert.equal(missing.status, 400);

  const badIndustry = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${A}/platform-blueprints`,
    headers: { "x-staged-tenant-id": A },
    body: intakeBody({ id: "bp-bad2", industry: "aerospace" }),
    repository
  });
  assert.equal(badIndustry.status, 400);
});

test("cross-tenant blueprint creation is denied", async () => {
  const repository = createMemoryRepository();
  const res = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${A}/platform-blueprints`,
    headers: { "x-staged-tenant-id": A },
    body: intakeBody({ id: "bp-x", tenantId: B }),
    repository
  });
  assert.equal(res.status, 403);
});

test("RBAC: read_only_auditor may read but not create blueprints", async () => {
  const oidc = { mode: "oidc", oidc: {} };
  const auditor = { userId: "a", tenantId: A, organizationRole: "read_only_auditor", projectRole: null, authenticated: true, staged: false };

  const list = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${A}/platform-blueprints`,
    repository: createMemoryRepository(),
    principal: auditor,
    authConfig: oidc
  });
  assert.equal(list.status, 200);

  const create = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${A}/platform-blueprints`,
    body: intakeBody(),
    repository: createMemoryRepository(),
    principal: auditor,
    authConfig: oidc
  });
  assert.equal(create.status, 403);
  assert.match(create.body.message, /role_denied/);
});
