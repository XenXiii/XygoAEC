import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { applyStripeEvent, applyStripeEventAsync, checkoutRequest, createBillingRepository, entitlementFor, verifyStripeSignature } from "../src/index.js";

test("checkout is workspace-bound and allowlisted", () => {
  const request = checkoutRequest({ plan: "Basic", workspaceId: "w1", userId: "u1", priceIds: { basic: "price_test" }, successUrl: "https://xygo.pro/app", cancelUrl: "https://xygo.pro/app" });
  assert.equal(request.clientReferenceId, "w1");
  assert.equal(request.metadata.xygo_user_id, "u1");
  assert.throws(() => checkoutRequest({ plan: "enterprise", workspaceId: "w1", userId: "u1", priceIds: {} }), /Unknown plan/);
});

test("webhook signature uses the untouched raw body and rejects tampering", () => {
  const raw = JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: {} } });
  const timestamp = 1_800_000_000;
  const secret = "whsec_test";
  const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  assert.equal(verifyStripeSignature(raw, `t=${timestamp},v1=${signature}`, secret, { now: timestamp * 1000 }).id, "evt_1");
  assert.throws(() => verifyStripeSignature(`${raw} `, `t=${timestamp},v1=${signature}`, secret, { now: timestamp * 1000 }), /invalid/);
});

test("verified events grant, revoke, and idempotently preserve entitlement", () => {
  const repository = createBillingRepository();
  const paid = { id: "evt_paid", type: "invoice.paid", data: { object: { customer: "cus_1", subscription: "sub_1", metadata: { xygo_workspace_id: "w1", xygo_plan: "basic" } } } };
  assert.equal(applyStripeEvent(repository, paid).entitlement, "active");
  assert.equal(applyStripeEvent(repository, paid).duplicate, true);
  const failed = { id: "evt_failed", type: "invoice.payment_failed", data: { object: { subscription: "sub_1", metadata: { xygo_workspace_id: "w1" } } } };
  assert.equal(applyStripeEvent(repository, failed).entitlement, "free");
  assert.equal(entitlementFor(repository.getSubscription("w1")), "free");
  assert.equal(repository.listEvents("w1").length, 2);
});

test("async event processing supports durable repositories", async () => {
  const repository = createBillingRepository();
  const event = { id: "evt_async", type: "invoice.paid", livemode: false, data: { object: { customer: "cus_1", subscription: "sub_1", metadata: { xygo_workspace_id: "w1", xygo_plan: "premium" } } } };
  assert.equal((await applyStripeEventAsync(repository, event)).entitlement, "active");
  assert.equal((await applyStripeEventAsync(repository, event)).duplicate, true);
});
