import test from "node:test";
import assert from "node:assert/strict";
import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

test("session audit result is tenant-derived, honest, and no-store", async () => {
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/session/audit-result",
    repository: createMemoryRepository(),
    headers: { "x-staged-tenant-id": "tenant-commercial-sim" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.item.tenantId, "tenant-commercial-sim");
  assert.equal(response.body.item.potentialAnnualRevenue.kind, "unknown");
  assert.equal(response.body.item.potentialAnnualRevenue.amount, null);
  assert.match(response.headers["cache-control"], /no-store/);
});

test("session audit result requires a tenant-bound identity", async () => {
  const response = await handleApiRequest({ method: "GET", path: "/v1/session/audit-result", repository: createMemoryRepository() });
  assert.equal(response.status, 401);
});

test("OIDC result uses only the verified principal tenant", async () => {
  const repository = createMemoryRepository();
  const response = await handleApiRequest({
    method: "GET",
    path: "/v1/session/audit-result",
    repository,
    authConfig: { mode: "oidc" },
    principal: { userId: "user-a", tenantId: "tenant-residential-sim", organizationRole: "client_owner", projectRole: null, authenticated: true, staged: false },
    headers: { "x-staged-tenant-id": "tenant-commercial-sim" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.item.tenantId, "tenant-residential-sim");
});
