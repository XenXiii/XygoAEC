import {
  createEmailDeliveryAuditEvent,
  emailWebhookStatus,
  verifyResendWebhook
} from "../../../packages/email-delivery/src/index.js";

export async function handleEmailWebhook({ rawBody, headers, repository, webhookSecret, auditSigningKey = null }) {
  let verified;
  try {
    verified = verifyResendWebhook({ rawBody, headers, webhookSecret });
  } catch (error) {
    return { status: 401, body: { accepted: false, code: "invalid_email_webhook", message: error.message } };
  }
  const { id: webhookId, event } = verified;
  const status = emailWebhookStatus(event.type);
  if (!status) return { status: 202, body: { accepted: true, ignored: true } };
  if (!event?.data?.email_id) {
    return { status: 400, body: { accepted: false, code: "invalid_email_webhook_payload" } };
  }
  const result = await repository.applyEmailWebhook({
    webhookId,
    event,
    auditEventFactory: (delivery, previousHash) => createEmailDeliveryAuditEvent(delivery, {
      action: `email.delivery.${status}`,
      actorId: "resend-webhook",
      previousHash,
      signingKey: auditSigningKey,
      timestamp: event.created_at,
      suffix: `webhook-${webhookId}`
    })
  });
  return {
    // A valid but unmatched provider id can be an acceptance/webhook race.
    // Return a retryable response instead of acknowledging and losing status.
    status: result.delivery || result.duplicate ? 200 : 503,
    body: {
      accepted: true,
      duplicate: result.duplicate,
      matched: Boolean(result.delivery),
      status: result.delivery?.status ?? null
    }
  };
}
