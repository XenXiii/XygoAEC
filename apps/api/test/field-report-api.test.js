import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

const A = "tenant-commercial-sim";
const B = "tenant-residential-sim";

function intakeBody(overrides = {}) {
  return JSON.stringify({
    id: "fr-new",
    projectId: "project-commercial-b",
    siteName: "Level 3 Slab",
    reportType: "daily_log",
    author: "user-commercial-vdc",
    observations: [
      { kind: "note", text: "Slab poured" },
      { kind: "checklist", label: "Rebar inspected", checked: true }
    ],
    ...overrides
  });
}

function req(method, path, tenantId, body) {
  return handleApiRequest({
    method,
    path,
    headers: tenantId ? { "x-staged-tenant-id": tenantId } : {},
    body: body ?? null,
    repository: req.repo
  });
}

async function withRepo(fn) {
  req.repo = createMemoryRepository();
  await fn(req.repo);
}

test("full workflow: capture -> draft -> approve, with audit at each write", async () => {
  await withRepo(async (repo) => {
    const created = await req("POST", `/v1/tenants/${A}/field-reports`, A, intakeBody());
    assert.equal(created.status, 201);
    assert.equal(created.body.item.status, "captured");
    assert.equal(created.body.item.staged, true);

    const drafted = await req("POST", `/v1/tenants/${A}/field-reports/fr-new/draft`, A, null);
    assert.equal(drafted.status, 200);
    assert.equal(drafted.body.item.status, "draft_generated");
    assert.equal(drafted.body.item.draft.simulated, true);
    assert.equal(drafted.body.item.clientVisible, false);

    const approved = await req("POST", `/v1/tenants/${A}/field-reports/fr-new/review`, A, JSON.stringify({ nextStatus: "approved" }));
    assert.equal(approved.status, 200);
    assert.equal(approved.body.item.status, "approved");
    assert.equal(approved.body.item.clientVisible, true);

    const audit = await req("GET", `/v1/tenants/${A}/audit-events`, A);
    const actions = audit.body.items.filter((e) => e.resourceId === "fr-new").map((e) => e.action);
    assert.ok(actions.includes("api.field_report.created"));
    assert.ok(actions.includes("api.field_report.draft_generated"));
    assert.ok(actions.includes("api.field_report.reviewed"));
  });
});

test("review before a draft exists is rejected", async () => {
  await withRepo(async () => {
    await req("POST", `/v1/tenants/${A}/field-reports`, A, intakeBody({ id: "fr-nodraft" }));
    const res = await req("POST", `/v1/tenants/${A}/field-reports/fr-nodraft/review`, A, JSON.stringify({ nextStatus: "approved" }));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /draft must be generated/);
  });
});

test("validation rejects missing fields and unknown report type", async () => {
  await withRepo(async () => {
    const missing = await req("POST", `/v1/tenants/${A}/field-reports`, A, JSON.stringify({ id: "fr-bad" }));
    assert.equal(missing.status, 400);

    const badType = await req("POST", `/v1/tenants/${A}/field-reports`, A, intakeBody({ id: "fr-bad2", reportType: "gossip" }));
    assert.equal(badType.status, 400);
  });
});

test("field reports are tenant-isolated", async () => {
  await withRepo(async () => {
    await req("POST", `/v1/tenants/${A}/field-reports`, A, intakeBody({ id: "fr-iso" }));

    const listB = await req("GET", `/v1/tenants/${B}/field-reports`, B);
    assert.ok(!listB.body.items.some((r) => r.id === "fr-iso"));

    const readB = await req("GET", `/v1/tenants/${B}/field-reports/fr-iso`, B);
    assert.equal(readB.status, 404);
  });
});

test("cross-tenant creation is denied", async () => {
  await withRepo(async () => {
    const res = await req("POST", `/v1/tenants/${A}/field-reports`, A, intakeBody({ id: "fr-x", tenantId: B }));
    assert.equal(res.status, 403);
  });
});

test("RBAC: read_only_auditor may read but not capture or draft", async () => {
  const oidc = { mode: "oidc", oidc: {} };
  const auditor = { userId: "a", tenantId: A, organizationRole: "read_only_auditor", projectRole: null, authenticated: true, staged: false };

  const list = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${A}/field-reports`,
    repository: createMemoryRepository(),
    principal: auditor,
    authConfig: oidc
  });
  assert.equal(list.status, 200);

  const create = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${A}/field-reports`,
    body: intakeBody(),
    repository: createMemoryRepository(),
    principal: auditor,
    authConfig: oidc
  });
  assert.equal(create.status, 403);
  assert.match(create.body.message, /role_denied/);
});
