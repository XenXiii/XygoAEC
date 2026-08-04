import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { Webhook } from "svix";

import {
  createEmailDelivery,
  emailDeliveryIntentMatches,
  emailConfigurationFromEnvironment,
  createLocalEmailSink,
  createResendEmailProvider,
  summarizeEmailDeliveryHealth,
  summarizeWorkerHeartbeat,
  verifyResendWebhook
} from "../src/index.js";

function delivery(overrides = {}) {
  return createEmailDelivery({
    tenantId: "tenant-a",
    recipientUserId: "user-a",
    recipientEmail: "owner@client.invalid",
    kind: "report_ready",
    resourceType: "field_report",
    resourceId: "report-a",
    idempotencyKey: "tenant-a:email:report-ready:report-a:user-a",
    templateData: {
      recipientName: "Avery Owner",
      reportTitle: "August 4 Daily Report",
      actionUrl: "http://127.0.0.1:8080/client-portal.html"
    },
    ...overrides
  }, { id: overrides.id ?? "delivery-a", now: new Date("2026-08-04T00:00:00.000Z") });
}

test("structured activation, report, and portal templates validate inputs", () => {
  assert.match(delivery().message.subject, /Report ready/);
  assert.match(createEmailDelivery({
    tenantId: "tenant-a",
    recipientEmail: "owner@client.invalid",
    kind: "activation",
    templateData: { recipientName: "Avery", workspaceName: "Atlas", actionUrl: "https://app.xygoaec.com" }
  }).message.subject, /Atlas access is ready/);
  assert.match(createEmailDelivery({
    tenantId: "tenant-a",
    recipientEmail: "owner@client.invalid",
    kind: "portal_update",
    templateData: {
      recipientName: "Avery",
      projectName: "North Tower",
      updateSummary: "The approved report is available.",
      actionUrl: "https://app.xygoaec.com/client-portal.html"
    }
  }).message.subject, /Project update/);
  assert.throws(() => delivery({ recipientEmail: "not-an-email" }), /Recipient email is invalid/);
  assert.throws(() => delivery({ templateData: { ...delivery().message, reportTitle: "Unsafe\nsubject", actionUrl: "https://app.xygoaec.com" } }), /single line/);
});

test("local/staged environment cannot select the external email transport", () => {
  assert.throws(
    () => emailConfigurationFromEnvironment({
      STAGED_MODE: "true",
      XYGO_EMAIL_TRANSPORT: "resend",
      XYGO_EMAIL_RESEND_API_URL: "https://api.resend.com",
      XYGO_EMAIL_RESEND_API_KEY: "test-api-key",
      XYGO_EMAIL_WEBHOOK_SECRET: "test-webhook-secret",
      XYGO_EMAIL_FROM: "notifications@updates.xygoaec.com"
    }),
    /STAGED_MODE=false/
  );
});

test("logical delivery comparison is insensitive to JSON object key order", () => {
  const original = delivery();
  const roundTripped = {
    ...original,
    message: {
      actionUrl: original.message.actionUrl,
      html: original.message.html,
      subject: original.message.subject,
      text: original.message.text
    }
  };
  assert.equal(emailDeliveryIntentMatches(original, roundTripped), true);
});

test("local sink is inspectable, persistent, and idempotent without sending email", async () => {
  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "xygo-email-sink-")), "sink.json");
  const sink = createLocalEmailSink({ filePath });
  const first = await sink.send(delivery());
  const second = await sink.send(delivery());
  assert.equal(second.id, first.id);
  assert.equal(second.duplicate, true);
  assert.equal(sink.all().length, 1);
  const reopened = createLocalEmailSink({ filePath });
  assert.equal(reopened.all().length, 1);
  await assert.rejects(
    () => reopened.send(delivery({
      templateData: {
        recipientName: "Avery Owner",
        reportTitle: "Changed payload",
        actionUrl: "http://127.0.0.1:8080/client-portal.html"
      }
    })),
    (error) => error.code === "email_idempotency_conflict" && error.retryable === false
  );
});

test("Resend adapter sends no test email and preserves the durable idempotency key", async () => {
  let request;
  const provider = createResendEmailProvider({
    apiUrl: "https://api.resend.com",
    apiKey: "test-key",
    from: "Xygo <notifications@updates.xygoaec.com>",
    replyTo: "support@xygoaec.com",
    requestTimeoutMs: 1000
  }, {
    fetchImpl: async (url, options) => {
      request = { url: String(url), options };
      return new Response(JSON.stringify({ id: "provider-message-a" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  const result = await provider.send(delivery());
  assert.equal(result.id, "provider-message-a");
  assert.equal(request.url, "https://api.resend.com/emails");
  assert.equal(request.options.headers["idempotency-key"], delivery().idempotencyKey);
  assert.equal(JSON.parse(request.options.body).to[0], "owner@client.invalid");
});

test("permanent provider conflicts are marked non-retryable", async () => {
  const provider = createResendEmailProvider({
    apiUrl: "https://api.resend.com",
    apiKey: "test-key",
    from: "notifications@updates.xygoaec.com",
    replyTo: null,
    requestTimeoutMs: 1000
  }, {
    fetchImpl: async () => new Response(JSON.stringify({
      name: "invalid_idempotent_request",
      message: "payload changed"
    }), { status: 409, headers: { "content-type": "application/json" } })
  });
  await assert.rejects(
    () => provider.send(delivery()),
    (error) => error.retryable === false && error.code === "invalid_idempotent_request"
  );
});

test("Resend webhook verification rejects tampering and stale replay", () => {
  const secret = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
  const webhook = new Webhook(secret);
  const now = new Date();
  const rawBody = JSON.stringify({ type: "email.delivered", created_at: now.toISOString(), data: { email_id: "message-a" } });
  const headers = {
    "svix-id": "msg-test-a",
    "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
    "svix-signature": webhook.sign("msg-test-a", now, rawBody)
  };
  assert.equal(verifyResendWebhook({ rawBody, headers, webhookSecret: secret, now }).event.type, "email.delivered");
  assert.throws(() => verifyResendWebhook({ rawBody: `${rawBody} `, headers, webhookSecret: secret, now }));
  assert.throws(() => verifyResendWebhook({ rawBody, headers, webhookSecret: secret, now: new Date(now.getTime() + 600_000) }), /replay window/);
});

test("email readiness reports stale backlog and terminal failures", () => {
  const queued = delivery();
  const failed = { ...delivery({ id: "delivery-b", idempotencyKey: "delivery-b" }), status: "bounced" };
  const health = summarizeEmailDeliveryHealth([queued, failed], {
    now: Date.parse("2026-08-04T01:00:00.000Z"),
    staleAfterMs: 1000,
    maxFailed: 0
  });
  assert.equal(health.ready, false);
  assert.equal(health.stale, 1);
  assert.equal(health.failures, 1);
});

test("worker heartbeat readiness accepts another fresh worker while one instance is stopping", () => {
  const now = Date.parse("2026-08-04T01:00:00.000Z");
  const health = summarizeWorkerHeartbeat([
    { serviceName: "worker", instanceId: "worker-a", status: "ready", lastSeenAt: "2026-08-04T00:59:55.000Z" },
    { serviceName: "worker", instanceId: "worker-b", status: "stopping", lastSeenAt: "2026-08-04T00:59:59.000Z" }
  ], { now, staleAfterMs: 10_000, requireHealthy: true });
  assert.equal(health.ready, true);
  assert.equal(health.instanceId, "worker-a");
});
