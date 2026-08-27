import crypto from "node:crypto";

export const PAID_STATUSES = new Set(["active", "trialing"]);
export const PLAN_CODES = Object.freeze(["basic", "premium", "business"]);

const clone = (value) => structuredClone(value);
const safeEqual = (left, right) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export function verifyStripeSignature(rawBody, signatureHeader, secret, { now = Date.now(), toleranceSeconds = 300 } = {}) {
  if (!secret || !signatureHeader || typeof rawBody !== "string") throw new Error("Stripe webhook verification is not configured.");
  const fields = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=", 2)));
  const timestamp = Number(fields.t);
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) throw new Error("Stripe webhook timestamp is invalid.");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!fields.v1 || !safeEqual(fields.v1, expected)) throw new Error("Stripe webhook signature is invalid.");
  return JSON.parse(rawBody);
}

export function createBillingRepository(seed = {}) {
  const subscriptions = new Map((seed.subscriptions ?? []).map((item) => [item.workspaceId, clone(item)]));
  const events = new Map((seed.events ?? []).map((item) => [item.providerEventId, clone(item)]));
  return {
    getSubscription(workspaceId) { return clone(subscriptions.get(workspaceId) ?? null); },
    saveSubscription(record) { subscriptions.set(record.workspaceId, clone(record)); return clone(record); },
    hasEvent(providerEventId) { return events.has(providerEventId); },
    saveEvent(record) { events.set(record.providerEventId, clone(record)); return clone(record); },
    listEvents(workspaceId) { return [...events.values()].filter((item) => item.workspaceId === workspaceId).map(clone); }
  };
}

export function entitlementFor(subscription) {
  return PAID_STATUSES.has(subscription?.status) ? "active" : "free";
}

export function checkoutRequest({ plan, workspaceId, userId, priceIds, successUrl, cancelUrl }) {
  const normalized = String(plan ?? "").trim().toLowerCase();
  if (!PLAN_CODES.includes(normalized)) throw Object.assign(new Error("Unknown plan."), { status: 400 });
  if (!workspaceId || !userId) throw Object.assign(new Error("Verified workspace identity is required."), { status: 401 });
  const priceId = priceIds?.[normalized];
  if (!priceId) throw Object.assign(new Error("Checkout is not configured."), { status: 503 });
  return {
    mode: "subscription",
    priceId,
    clientReferenceId: workspaceId,
    metadata: { xygo_workspace_id: workspaceId, xygo_user_id: userId, xygo_plan: normalized },
    successUrl,
    cancelUrl
  };
}

const EVENT_STATUS = Object.freeze({
  "customer.subscription.created": null,
  "customer.subscription.updated": null,
  "customer.subscription.deleted": "canceled",
  "invoice.payment_failed": "past_due",
  "invoice.paid": "active",
  "charge.refunded": "canceled"
});

export function applyStripeEvent(repository, event, { now = () => new Date().toISOString() } = {}) {
  if (!event?.id || !event?.type) throw Object.assign(new Error("Malformed Stripe event."), { status: 400 });
  if (repository.hasEvent(event.id)) return { duplicate: true, entitlement: null };
  const object = event.data?.object ?? {};
  const workspaceId = object.metadata?.xygo_workspace_id || object.subscription_details?.metadata?.xygo_workspace_id;
  if (!workspaceId) throw Object.assign(new Error("Stripe event is missing verified workspace metadata."), { status: 400 });
  if (!(event.type in EVENT_STATUS)) {
    repository.saveEvent({ providerEventId: event.id, workspaceId, eventType: event.type, processedAt: now() });
    return { ignored: true, entitlement: entitlementFor(repository.getSubscription(workspaceId)) };
  }
  const previous = repository.getSubscription(workspaceId);
  const providerStatus = EVENT_STATUS[event.type] ?? object.status;
  const status = ["incomplete", "trialing", "active", "past_due", "canceled", "unpaid"].includes(providerStatus) ? providerStatus : "incomplete";
  const subscription = repository.saveSubscription({
    workspaceId,
    providerCustomerId: object.customer ?? previous?.providerCustomerId ?? null,
    providerSubscriptionId: object.subscription ?? object.id ?? previous?.providerSubscriptionId ?? null,
    planCode: object.metadata?.xygo_plan ?? previous?.planCode ?? null,
    status,
    updatedAt: now()
  });
  repository.saveEvent({ providerEventId: event.id, workspaceId, eventType: event.type, processedAt: now() });
  return { duplicate: false, subscription, entitlement: entitlementFor(subscription) };
}

export async function applyStripeEventAsync(repository, event, { now = () => new Date().toISOString() } = {}) {
  if (!event?.id || !event?.type) throw Object.assign(new Error("Malformed Stripe event."), { status: 400 });
  if (await repository.hasEvent(event.id)) return { duplicate: true, entitlement: null };
  const object = event.data?.object ?? {};
  const workspaceId = object.metadata?.xygo_workspace_id || object.subscription_details?.metadata?.xygo_workspace_id;
  if (!workspaceId) throw Object.assign(new Error("Stripe event is missing verified workspace metadata."), { status: 400 });
  if (!(event.type in EVENT_STATUS)) {
    await repository.saveEvent({ providerEventId: event.id, workspaceId, eventType: event.type, processedAt: now(), livemode: Boolean(event.livemode), outcome: "ignored" });
    return { ignored: true, entitlement: entitlementFor(await repository.getSubscription(workspaceId)) };
  }
  const previous = await repository.getSubscription(workspaceId);
  const providerStatus = EVENT_STATUS[event.type] ?? object.status;
  const status = ["incomplete", "trialing", "active", "past_due", "canceled", "unpaid"].includes(providerStatus) ? providerStatus : "incomplete";
  const subscription = await repository.saveSubscription({
    workspaceId,
    providerCustomerId: object.customer ?? previous?.providerCustomerId ?? null,
    providerSubscriptionId: object.subscription ?? object.id ?? previous?.providerSubscriptionId ?? null,
    planCode: object.metadata?.xygo_plan ?? previous?.planCode ?? null,
    status,
    latestProviderEventId: event.id,
    updatedAt: now()
  });
  await repository.saveEvent({ providerEventId: event.id, workspaceId, eventType: event.type, processedAt: now(), livemode: Boolean(event.livemode), outcome: "processed" });
  return { duplicate: false, subscription, entitlement: entitlementFor(subscription) };
}
