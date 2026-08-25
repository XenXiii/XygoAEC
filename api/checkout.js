const STRIPE_CHECKOUT_ENDPOINT = "https://api.stripe.com/v1/checkout/sessions";
const SITE_URL = "https://www.xygo.pro";

const PLAN_CONFIG = Object.freeze({
  basic: { priceEnv: "STRIPE_BASIC_PRICE_ID", couponEnv: "STRIPE_BASIC_INTRO_COUPON_ID" },
  premium: { priceEnv: "STRIPE_PREMIUM_PRICE_ID", couponEnv: "STRIPE_PREMIUM_INTRO_COUPON_ID" },
  business: { priceEnv: "STRIPE_BUSINESS_PRICE_ID", couponEnv: "STRIPE_BUSINESS_INTRO_COUPON_ID" }
});

export function resolveCheckoutPlan(value, environment = process.env) {
  const plan = String(value ?? "").trim().toLowerCase();
  const config = PLAN_CONFIG[plan];
  if (!config) throw new Error("Unknown plan.");
  const priceId = environment[config.priceEnv];
  const couponId = environment[config.couponEnv];
  if (!environment.STRIPE_SECRET_KEY || !priceId || !couponId) throw new Error("Checkout is not configured.");
  return { plan, priceId, couponId };
}

export function checkoutPayload({ plan, priceId, couponId }) {
  return new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "discounts[0][coupon]": couponId,
    billing_address_collection: "required",
    "metadata[xygo_plan]": plan,
    "subscription_data[metadata][xygo_plan]": plan,
    success_url: `${SITE_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/services?checkout=canceled`
  });
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ ok: false, error: "Method not allowed." });
  }

  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  } catch {
    return response.status(400).json({ ok: false, error: "Invalid request body." });
  }

  let checkout;
  try {
    checkout = resolveCheckoutPlan(body?.plan);
  } catch (error) {
    const status = /configured/i.test(error.message) ? 503 : 400;
    return response.status(status).json({ ok: false, error: error.message });
  }

  try {
    const stripeResponse = await fetch(STRIPE_CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "content-type": "application/x-www-form-urlencoded"
      },
      body: checkoutPayload(checkout)
    });
    const result = await stripeResponse.json();
    if (!stripeResponse.ok || !result.url) {
      return response.status(502).json({ ok: false, error: "Secure checkout is temporarily unavailable." });
    }
    return response.status(200).json({ ok: true, url: result.url });
  } catch {
    return response.status(502).json({ ok: false, error: "Secure checkout is temporarily unavailable." });
  }
}
