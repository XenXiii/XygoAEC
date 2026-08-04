import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../src/handlers.js";
import { createOutboxStore } from "../src/reliability/outbox.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createEmailDelivery, queueEmailDelivery } from "../../../packages/email-delivery/src/index.js";

const TENANT_A = "tenant-commercial-sim";
const TENANT_B = "tenant-residential-sim";
const oidcConfig = { mode: "oidc" };

function principal(tenantId, organizationRole = "client_owner") {
  return { tenantId, userId: `${tenantId}-owner`, organizationRole, projectRole: null, authMode: "oidc" };
}

test("email delivery status records are role-gated and tenant-isolated", async () => {
  const repository = createMemoryRepository();
  repository.createEmailDelivery(createEmailDelivery({
    tenantId: TENANT_A,
    recipientEmail: "owner@client.invalid",
    kind: "activation",
    templateData: {
      recipientName: "Owner",
      workspaceName: "Commercial",
      actionUrl: "https://app.xygoaec.com/client-portal.html"
    }
  }, { id: "delivery-tenant-a" }));

  const own = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${TENANT_A}/email-deliveries`,
    repository,
    principal: principal(TENANT_A),
    authConfig: oidcConfig
  });
  assert.equal(own.status, 200);
  assert.deepEqual(own.body.items.map((item) => item.id), ["delivery-tenant-a"]);

  const crossTenant = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${TENANT_B}/email-deliveries`,
    repository,
    principal: principal(TENANT_A),
    authConfig: oidcConfig
  });
  assert.equal(crossTenant.status, 403);

  const viewer = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${TENANT_A}/email-deliveries`,
    repository,
    principal: principal(TENANT_A, "client_viewer"),
    authConfig: oidcConfig
  });
  assert.equal(viewer.status, 403);
});

test("structured portal-update messages enqueue through the durable outbox without sending", async () => {
  const repository = createMemoryRepository();
  const outbox = createOutboxStore();
  const record = createEmailDelivery({
    tenantId: TENANT_A,
    recipientEmail: "owner@client.invalid",
    kind: "portal_update",
    resourceType: "project",
    resourceId: "project-commercial-b",
    idempotencyKey: "tenant-a:portal-update:project-commercial-b:owner",
    templateData: {
      recipientName: "Owner",
      projectName: "Commercial project",
      updateSummary: "An approved update is ready.",
      actionUrl: "https://app.xygoaec.com/client-portal.html"
    }
  }, { id: "delivery-portal-update" });
  const result = await queueEmailDelivery({ repository, outbox, delivery: record });
  assert.equal(result.created, true);
  assert.equal(repository.getEmailDeliveryById(record.id).status, "queued");
  const jobs = outbox.all().filter((job) => job.event.aggregateId === record.id);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].event.payload, { deliveryId: record.id, kind: "portal_update" });
  assert.equal("recipientEmail" in jobs[0].event.payload, false);
});
