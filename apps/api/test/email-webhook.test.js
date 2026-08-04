import test from "node:test";
import assert from "node:assert/strict";

import { Webhook } from "svix";

import { handleEmailWebhook } from "../src/email-webhook.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import {
  createEmailDelivery,
  markEmailDeliveryAccepted
} from "../../../packages/email-delivery/src/index.js";

const SECRET = `whsec_${Buffer.from("abcdef0123456789abcdef0123456789").toString("base64")}`;

function signedEvent(event, { id = "msg-webhook-a", now = new Date() } = {}) {
  const rawBody = JSON.stringify(event);
  const webhook = new Webhook(SECRET);
  return {
    rawBody,
    headers: {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
      "svix-signature": webhook.sign(id, now, rawBody)
    }
  };
}

test("verified provider webhooks update delivery status once and append tenant audit evidence", async () => {
  const repository = createMemoryRepository();
  const queued = createEmailDelivery({
    tenantId: "tenant-commercial-sim",
    recipientEmail: "owner@client.invalid",
    kind: "activation",
    templateData: {
      recipientName: "Owner",
      workspaceName: "Atlas",
      actionUrl: "https://app.xygoaec.com/client-portal.html"
    }
  }, { id: "delivery-webhook-a" });
  repository.createEmailDelivery(queued);
  repository.saveEmailDelivery(markEmailDeliveryAccepted(queued, {
    provider: "resend",
    providerMessageId: "provider-message-webhook-a"
  }));
  const now = new Date();
  const request = signedEvent({
    type: "email.delivered",
    created_at: now.toISOString(),
    data: { email_id: "provider-message-webhook-a" }
  }, { now });
  const first = await handleEmailWebhook({ ...request, repository, webhookSecret: SECRET });
  const second = await handleEmailWebhook({ ...request, repository, webhookSecret: SECRET });
  assert.equal(first.status, 200);
  assert.equal(first.body.status, "delivered");
  assert.equal(second.body.duplicate, true);
  assert.equal(repository.getEmailDeliveryById(queued.id).status, "delivered");
  assert.equal(repository.listAuditEventsByTenant(queued.tenantId).filter(
    (event) => event.action === "email.delivery.delivered"
  ).length, 1);
});

test("email webhooks reject invalid signatures and do not update status", async () => {
  const repository = createMemoryRepository();
  const response = await handleEmailWebhook({
    rawBody: "{}",
    headers: { "svix-id": "bad", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,bad" },
    repository,
    webhookSecret: SECRET
  });
  assert.equal(response.status, 401);
  assert.equal(repository.listEmailDeliveriesByTenant("tenant-commercial-sim").length, 0);
});

test("tracked webhooks request retry when provider acceptance is not canonical yet", async () => {
  const repository = createMemoryRepository();
  const now = new Date();
  const request = signedEvent({
    type: "email.delivered",
    created_at: now.toISOString(),
    data: { email_id: "provider-message-arrived-first" }
  }, { id: "msg-webhook-arrived-first", now });
  const response = await handleEmailWebhook({ ...request, repository, webhookSecret: SECRET });
  assert.equal(response.status, 503);
  assert.equal(response.body.matched, false);
});
