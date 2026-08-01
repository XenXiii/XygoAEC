import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

const A = "tenant-commercial-sim";
const B = "tenant-residential-sim";

function get(tenantId) {
  return handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${tenantId}/client-portal`,
    headers: { "x-staged-tenant-id": tenantId },
    repository: createMemoryRepository()
  });
}

test("portal exposes only approved reports (drafted reports are hidden)", async () => {
  // Seed: field-report-commercial-a is draft_generated (hidden);
  //       field-report-commercial-b is approved (visible).
  const res = await get(A);
  assert.equal(res.status, 200);
  const portal = res.body.items.find((p) => p.projectId === "project-commercial-b");
  assert.ok(portal, "expected the commercial project portal");

  assert.equal(portal.reports.length, 1);
  assert.equal(portal.reports[0].status, "approved");
  // The still-in-draft report must not leak into the client view.
  assert.ok(!portal.reports.some((r) => r.title?.includes("Level 2 Core")));
});

test("payment is a non-actionable staged placeholder", async () => {
  const res = await get(A);
  const portal = res.body.items[0];
  assert.equal(portal.payment.status, "staged_no_billing");
  assert.equal(portal.payment.balanceDue, null);
  assert.equal(portal.staged, true);
});

test("portal is tenant-isolated", async () => {
  const res = await get(B);
  // Residential tenant sees only its own project; no commercial content.
  assert.ok(res.body.items.every((p) => p.tenantId === B));
  assert.ok(!res.body.items.some((p) => p.projectId === "project-commercial-b"));
});

test("client-portal is read-only (writes are not routed)", async () => {
  const res = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${A}/client-portal`,
    headers: { "x-staged-tenant-id": A },
    body: "{}",
    repository: createMemoryRepository()
  });
  // No POST route exists -> not found (never a write path).
  assert.equal(res.status, 404);
});

test("RBAC: read_only_auditor may read the client portal", async () => {
  const res = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${A}/client-portal`,
    repository: createMemoryRepository(),
    principal: { userId: "a", tenantId: A, organizationRole: "read_only_auditor", projectRole: null, authenticated: true, staged: false },
    authConfig: { mode: "oidc", oidc: {} }
  });
  assert.equal(res.status, 200);
});
