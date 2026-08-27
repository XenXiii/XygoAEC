import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { createAuditPlatformRepository } from "../../../packages/audit-platform/src/index.js";
import { createBillingRepository } from "../../../packages/billing/src/index.js";
import { handleBillingRequest } from "../src/billing/handler.js";

const principal = { authenticated: true, userId: "u1" };
const env = { STRIPE_BASIC_PRICE_ID: "price_basic", STRIPE_WEBHOOK_SECRET: "whsec_test", XYGO_SITE_URL: "https://www.xygo.pro" };
function auditRepository(eligible = true) {
  return createAuditPlatformRepository({ workspaces: [{ id: "w1" }, { id: "w2" }], memberships: [{ workspaceId: "w1", userId: "u1", role: "owner", status: "active" }], conversations: [{ id: "c1", workspaceId: "w1" }], states: [{ conversationId: "c1", workspaceId: "w1", freeResultEligible: eligible }] });
}

test("checkout requires verified membership and a server-derived free result", async () => {
  const gateway = { async createCheckout(request) { return { id: "cs_test", url: "https://checkout.stripe.test/session", request }; } };
  const denied = await handleBillingRequest({ method: "POST", path: "/v1/workspaces/w2/billing/checkout", body: { plan: "basic" }, principal, auditRepository: auditRepository(), billingRepository: createBillingRepository(), env, stripeGateway: gateway });
  assert.equal(denied.status, 403);
  const result = await handleBillingRequest({ method: "POST", path: "/v1/workspaces/w1/billing/checkout", body: { plan: "basic" }, principal, auditRepository: auditRepository(), billingRepository: createBillingRepository(), env, stripeGateway: gateway });
  assert.equal(result.status, 201);
  assert.equal(result.body.item.request.metadata.xygo_workspace_id, "w1");
});

test("redirect does not unlock; only a verified webhook changes entitlement", async () => {
  const billingRepository = createBillingRepository();
  const repo = auditRepository();
  const before = await handleBillingRequest({ method: "GET", path: "/v1/workspaces/w1/billing/entitlement?checkout=success", principal, auditRepository: repo, billingRepository, env });
  assert.equal(before.body.item.entitlement, "free");
  const event = { id: "evt_1", type: "invoice.paid", data: { object: { customer: "cus_1", subscription: "sub_1", metadata: { xygo_workspace_id: "w1", xygo_plan: "basic" } } } };
  const raw = JSON.stringify(event); const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest("hex");
  const webhook = await handleBillingRequest({ method: "POST", path: "/v1/billing/stripe/webhook", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body: raw, auditRepository: repo, billingRepository, env });
  assert.equal(webhook.status, 200);
  const after = await handleBillingRequest({ method: "GET", path: "/v1/workspaces/w1/billing/entitlement", principal, auditRepository: repo, billingRepository, env });
  assert.equal(after.body.item.entitlement, "active");
});
