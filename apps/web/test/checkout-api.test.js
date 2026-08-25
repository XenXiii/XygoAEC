import test from "node:test";
import assert from "node:assert/strict";
import { checkoutPayload, resolveCheckoutPlan } from "../../../api/checkout.js";

const environment = {
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_BASIC_PRICE_ID: "price_basic",
  STRIPE_BASIC_INTRO_COUPON_ID: "coupon_basic"
};

test("checkout only resolves an allowlisted, fully configured plan", () => {
  assert.deepEqual(resolveCheckoutPlan(" BASIC ", environment), {
    plan: "basic",
    priceId: "price_basic",
    couponId: "coupon_basic"
  });
  assert.throws(() => resolveCheckoutPlan("enterprise", environment), /Unknown plan/);
  assert.throws(() => resolveCheckoutPlan("basic", {}), /not configured/);
});

test("checkout creates a subscription with one-time introductory discount", () => {
  const payload = checkoutPayload(resolveCheckoutPlan("basic", environment));
  assert.equal(payload.get("mode"), "subscription");
  assert.equal(payload.get("line_items[0][price]"), "price_basic");
  assert.equal(payload.get("discounts[0][coupon]"), "coupon_basic");
  assert.match(payload.get("success_url"), /checkout-success/);
  assert.match(payload.get("cancel_url"), /services/);
});
