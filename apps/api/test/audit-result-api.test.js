import test from "node:test";
import assert from "node:assert/strict";
import { handleApiRequest } from "../src/handlers.js";
import { createAuditPlatformRepository } from "../../../packages/audit-platform/src/index.js";
import { applyFact, createAuditState } from "../../../packages/audit-engine/src/index.js";

const owner = { userId: "owner-a", authenticated: true, tenantId: null };
const other = { userId: "owner-b", authenticated: true, tenantId: null };
const call = (auditRepository, principal, method, path, body, headers = {}) =>
  handleApiRequest({ auditRepository, principal, method, path, headers, body: body ? JSON.stringify(body) : null, authConfig: { mode: "oidc" } });

// Build a conversation whose persisted state carries the intended sales facts —
// rather than relying on the copilot provider (which records operations.open_items).
function salesState() {
  let state = createAuditState({ workspaceId: "w-a", conversationId: "c", now: "t0" });
  const add = (f) => (state = applyFact(state, { workspaceId: "w-a", updatedAt: "t1", ...f }));
  add({ id: "f1", stage: "sales_and_lead_management", key: "sales.stalled_leads", value: 43, sourceType: "connected", confidence: "high", evidenceRef: "crm:1" });
  add({ id: "f2", stage: "revenue_and_unit_economics", key: "sales.avg_deal_value", value: 4800, sourceType: "connected", confidence: "high", evidenceRef: "stripe:1" });
  add({ id: "f3", stage: "sales_and_lead_management", key: "sales.close_rate", value: 0.22, sourceType: "manual", confidence: "medium", evidenceRef: "owner:1" });
  return state;
}
function seeded(extraConversations = [], states = []) {
  return createAuditPlatformRepository({
    workspaces: [{ id: "w-a", displayName: "A" }],
    memberships: [{ workspaceId: "w-a", userId: "owner-a", role: "owner", status: "active" }],
    conversations: [{ id: "c", workspaceId: "w-a", createdBy: "owner-a", title: "Audit", status: "active", createdAt: "t0", updatedAt: "t0" }, ...extraConversations],
    states
  });
}

test("audit-result derives a projection from the persisted sales facts", async () => {
  const repo = seeded([], [salesState()]);
  const result = await call(repo, owner, "GET", "/v1/workspaces/w-a/conversations/c/audit-result");
  assert.equal(result.status, 200);
  const body = result.body.item;
  // The correct fact key is present (not operations.open_items).
  assert.ok(body.classification.facts.some((f) => f.key === "sales.stalled_leads"));
  assert.equal(body.opportunityCount, 1);
  const opp = body.growthOpportunities[0];
  assert.equal(opp.kind, "projection");
  assert.equal(opp.potentialAnnualRevenue.amount, 43 * 4800 * 0.22);
  assert.deepEqual(opp.assumptions, []);
  assert.equal(opp.confidence, "medium");
  assert.equal(body.potentialAnnualRevenue.kind, "projection");
  assert.equal(body.potentialAnnualRevenue.amount, 43 * 4800 * 0.22);
  assert.equal(body.provenance.factCount, 3);
  assert.equal(body.businessHealth.kind, "inference");
  assert.equal(typeof body.businessHealth.score, "number");
});

test("an audit with no facts reports unknown revenue and unknown health, never fabricated", async () => {
  const repo = seeded([{ id: "empty", workspaceId: "w-a", createdBy: "owner-a", title: "Audit", status: "active", createdAt: "t0", updatedAt: "t0" }], []);
  const result = await call(repo, owner, "GET", "/v1/workspaces/w-a/conversations/empty/audit-result");
  assert.equal(result.status, 200);
  assert.equal(result.body.item.potentialAnnualRevenue.kind, "unknown");
  assert.equal(result.body.item.potentialAnnualRevenue.amount, null);
  assert.equal(result.body.item.businessHealth.score, null);
  assert.equal(result.body.item.businessHealth.kind, "unknown");
});

test("audit-result respects tenant isolation and sets no-store", async () => {
  const repo = seeded([], [salesState()]);
  const denied = await call(repo, other, "GET", "/v1/workspaces/w-a/conversations/c/audit-result");
  assert.equal(denied.status, 403);
  const ok = await call(repo, owner, "GET", "/v1/workspaces/w-a/conversations/c/audit-result");
  assert.match(ok.headers["cache-control"], /no-store/);
});
