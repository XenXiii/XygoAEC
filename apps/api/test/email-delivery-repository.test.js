import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createFileRepository } from "../src/repositories/file.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createSqliteRepository } from "../src/repositories/sqlite.js";
import { createAuditEvent } from "../../../packages/audit/src/foundation.js";
import { createEmailDelivery, markEmailDeliveryAccepted } from "../../../packages/email-delivery/src/index.js";

const TENANT_A = "tenant-commercial-sim";
const TENANT_B = "tenant-residential-sim";

function repository(kind) {
  if (kind === "memory") return createMemoryRepository();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `xygo-email-${kind}-`));
  return kind === "file"
    ? createFileRepository({ filePath: path.join(root, "repository.json") })
    : createSqliteRepository({ filePath: path.join(root, "repository.sqlite") });
}

function delivery(overrides = {}) {
  return createEmailDelivery({
    tenantId: TENANT_A,
    recipientEmail: "owner@client.invalid",
    kind: "activation",
    idempotencyKey: "tenant-a:activation:user-a",
    templateData: {
      recipientName: "Owner",
      workspaceName: "Commercial",
      actionUrl: "https://app.xygoaec.com/client-portal.html"
    },
    ...overrides
  }, { id: overrides.id ?? "delivery-repository-a", now: new Date("2026-08-04T00:00:00.000Z") });
}

for (const kind of ["memory", "file", "sqlite"]) {
  test(`[${kind}] email delivery idempotency detects conflicts`, async () => {
    const repo = repository(kind);
    const record = delivery();
    assert.equal((await repo.createEmailDelivery(record)).created, true);
    assert.equal((await repo.createEmailDelivery(record)).created, false);
    await assert.rejects(
      async () => repo.createEmailDelivery(delivery({ id: "delivery-conflict", recipientEmail: "other@client.invalid" })),
      (error) => error.code === "email_idempotency_conflict"
    );
  });

  test(`[${kind}] email audit finalization extends only the owning tenant chain`, async () => {
    const repo = repository(kind);
    const record = delivery({ id: `delivery-audit-${kind}`, idempotencyKey: `delivery-audit-${kind}` });
    await repo.createEmailDelivery(record);
    const tenantEvent = createAuditEvent({
      eventId: `tenant-a-before-${kind}`,
      tenantId: TENANT_A,
      actorType: "system",
      actorId: "test",
      action: "test.tenant_a",
      resourceType: "test",
      resourceId: "a",
      timestamp: "2026-08-04T00:00:01.000Z"
    });
    const otherTenantEvent = createAuditEvent({
      eventId: `tenant-b-after-${kind}`,
      tenantId: TENANT_B,
      actorType: "system",
      actorId: "test",
      action: "test.tenant_b",
      resourceType: "test",
      resourceId: "b",
      timestamp: "2026-08-04T00:00:02.000Z"
    });
    await repo.appendAuditEvent(tenantEvent);
    await repo.appendAuditEvent(otherTenantEvent);
    const accepted = markEmailDeliveryAccepted(record, {
      provider: "sink",
      providerMessageId: `sink-${kind}`,
      now: new Date("2026-08-04T00:00:03.000Z")
    });
    await repo.finalizeEmailDelivery({
      delivery: accepted,
      auditEventFactory: (previousHash) => createAuditEvent({
        eventId: `tenant-a-email-${kind}`,
        tenantId: TENANT_A,
        actorType: "system",
        actorId: "email-worker",
        action: "email.delivery.accepted",
        resourceType: "email_delivery",
        resourceId: accepted.id,
        previousHash,
        timestamp: "2026-08-04T00:00:03.000Z"
      })
    });
    assert.equal((await repo.listAuditEventsByTenant(TENANT_A)).at(-1).previousHash, tenantEvent.eventHash);
  });

  test(`[${kind}] suppression webhooks persist one tenant-scoped normalized recipient`, async () => {
    const repo = repository(kind);
    const record = delivery({ id: `delivery-suppression-${kind}`, idempotencyKey: `delivery-suppression-${kind}` });
    await repo.createEmailDelivery(record);
    const accepted = markEmailDeliveryAccepted(record, {
      provider: "resend",
      providerMessageId: `provider-suppression-${kind}`,
      now: new Date("2026-08-04T00:00:01.000Z")
    });
    await repo.saveEmailDelivery(accepted);
    const event = {
      type: "email.complained",
      created_at: "2026-08-04T00:00:02.000Z",
      data: { email_id: `provider-suppression-${kind}` }
    };
    assert.equal((await repo.applyEmailWebhook({ webhookId: `webhook-suppression-${kind}`, event })).duplicate, false);
    assert.equal((await repo.applyEmailWebhook({ webhookId: `webhook-suppression-${kind}`, event })).duplicate, true);
    const suppression = await repo.getEmailSuppression(TENANT_A, "OWNER@CLIENT.INVALID");
    assert.equal(suppression.reason, "complaint");
    assert.equal(suppression.providerEventId, `webhook-suppression-${kind}`);
    assert.equal((await repo.listEmailSuppressionsByTenant(TENANT_A)).length, 1);
    assert.equal((await repo.listEmailSuppressionsByTenant(TENANT_B)).length, 0);
  });
}
