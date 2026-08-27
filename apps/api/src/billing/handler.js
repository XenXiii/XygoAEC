import { applyStripeEventAsync, checkoutRequest, createBillingRepository, entitlementFor, verifyStripeSignature } from "../../../../packages/billing/src/index.js";
import { baseResponseHeaders } from "../http/headers.js";

export const sharedBillingRepository = createBillingRepository();
const response = (status, body) => ({ status, headers: baseResponseHeaders({ "content-type": "application/json", "cache-control": "no-store" }), body });

export function createStripeGateway({ env = process.env, fetchImpl = fetch } = {}) {
  const secretKey = env.STRIPE_SECRET_KEY;
  if (!secretKey?.startsWith("sk_test_")) return null;
  const send = async (path, payload) => {
    const result = await fetchImpl(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { authorization: `Bearer ${secretKey}`, "content-type": "application/x-www-form-urlencoded" }, body: payload });
    const data = await result.json();
    if (!result.ok || !data.url) throw Object.assign(new Error("Stripe test-mode request failed."), { status: 502 });
    return { id: data.id, url: data.url };
  };
  return {
    createCheckout(request) {
      return send("checkout/sessions", new URLSearchParams({ mode: request.mode, "line_items[0][price]": request.priceId, "line_items[0][quantity]": "1", client_reference_id: request.clientReferenceId, "metadata[xygo_workspace_id]": request.metadata.xygo_workspace_id, "metadata[xygo_user_id]": request.metadata.xygo_user_id, "metadata[xygo_plan]": request.metadata.xygo_plan, "subscription_data[metadata][xygo_workspace_id]": request.metadata.xygo_workspace_id, "subscription_data[metadata][xygo_plan]": request.metadata.xygo_plan, success_url: request.successUrl, cancel_url: request.cancelUrl }));
    },
    createPortal({ customerId, returnUrl }) { return send("billing_portal/sessions", new URLSearchParams({ customer: customerId, return_url: returnUrl })); }
  };
}

async function requireMember(auditRepository, principal, workspaceId) {
  if (!principal?.authenticated) throw Object.assign(new Error("Authentication required."), { status: 401 });
  const membership = await auditRepository.getMembership(workspaceId, principal.userId);
  if (!membership) throw Object.assign(new Error("Workspace access denied."), { status: 403 });
  return membership;
}

async function freeResultReady(auditRepository, workspaceId) {
  for (const conversation of await auditRepository.listConversations(workspaceId)) {
    if ((await auditRepository.getAuditState(workspaceId, conversation.id))?.freeResultEligible) return true;
  }
  return false;
}

export async function handleBillingRequest({ method, path, headers = {}, body, principal, auditRepository, billingRepository = sharedBillingRepository, env = process.env, stripeGateway }) {
  const url = new URL(path, "http://internal");
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
  const isWebhook = method === "POST" && parts.join("/") === "v1/billing/stripe/webhook";
  const isWorkspaceBilling = parts[0] === "v1" && parts[1] === "workspaces" && parts[2] && parts[3] === "billing";
  if (!isWebhook && !isWorkspaceBilling) return null;
  try {
    stripeGateway ??= createStripeGateway({ env });
    if (isWebhook) {
      const event = verifyStripeSignature(String(body ?? ""), headers["stripe-signature"] ?? headers["Stripe-Signature"], env.STRIPE_WEBHOOK_SECRET);
      return response(200, { received: true, ...await applyStripeEventAsync(billingRepository, event) });
    }
    const workspaceId = parts[2];
    await requireMember(auditRepository, principal, workspaceId);
    if (method === "GET" && parts[4] === "entitlement") {
      const subscription = await billingRepository.getSubscription(workspaceId);
      return response(200, { item: { workspaceId, entitlement: entitlementFor(subscription), subscription } });
    }
    if (method === "POST" && parts[4] === "checkout") {
      if (!await freeResultReady(auditRepository, workspaceId)) throw Object.assign(new Error("Complete enough of the audit to receive the free solution before checkout."), { status: 409 });
      const input = typeof body === "string" ? JSON.parse(body) : body ?? {};
      const request = checkoutRequest({
        plan: input.plan,
        workspaceId,
        userId: principal.userId,
        priceIds: { basic: env.STRIPE_BASIC_PRICE_ID, premium: env.STRIPE_PREMIUM_PRICE_ID, business: env.STRIPE_BUSINESS_PRICE_ID },
        successUrl: `${env.XYGO_SITE_URL ?? "https://www.xygo.pro"}/app?checkout=submitted`,
        cancelUrl: `${env.XYGO_SITE_URL ?? "https://www.xygo.pro"}/app?checkout=canceled`
      });
      if (!stripeGateway?.createCheckout) throw Object.assign(new Error("Checkout is not configured."), { status: 503 });
      return response(201, { item: await stripeGateway.createCheckout(request) });
    }
    if (method === "POST" && parts[4] === "portal") {
      if (!stripeGateway?.createPortal) throw Object.assign(new Error("Billing Portal is not configured."), { status: 503 });
      const subscription = await billingRepository.getSubscription(workspaceId);
      if (!subscription?.providerCustomerId) throw Object.assign(new Error("No billing customer exists for this workspace."), { status: 409 });
      return response(201, { item: await stripeGateway.createPortal({ customerId: subscription.providerCustomerId, returnUrl: `${env.XYGO_SITE_URL ?? "https://www.xygo.pro"}/app` }) });
    }
    return response(404, { error: "not_found", message: "Billing route not found." });
  } catch (error) {
    return response(error.status ?? (/signature|timestamp|verification/i.test(error.message) ? 400 : 500), { error: "billing_request_failed", message: error.status ? error.message : "Billing request failed safely." });
  }
}
