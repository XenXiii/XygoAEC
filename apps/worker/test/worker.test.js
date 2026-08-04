import test from "node:test";
import assert from "node:assert/strict";

import { createOutboxEvent } from "../../../packages/audit/src/foundation.js";
import { createOutboxStore } from "../../api/src/reliability/outbox.js";
import { createMemoryRepository } from "../../api/src/repositories/memory.js";
import {
  createEmailDelivery,
  createLocalEmailSink,
  queueEmailDelivery
} from "../../../packages/email-delivery/src/index.js";
import { createWorker } from "../src/worker.js";

function event(id) {
  return createOutboxEvent({
    id,
    tenantId: "tenant-commercial-sim",
    eventType: "worker.test",
    aggregateType: "test",
    aggregateId: id
  });
}

test("worker honors configured concurrency without duplicate claims", async () => {
  const store = createOutboxStore();
  for (const id of ["job-1", "job-2", "job-3"]) store.enqueue(event(id), { now: 0 });
  const delivered = [];
  const worker = createWorker({
    store,
    concurrency: 2,
    handler: async (item) => delivered.push(item.id)
  });
  const first = await worker.tick(0);
  const second = await worker.tick(0);
  assert.equal(first.processed, 2);
  assert.equal(second.processed, 1);
  assert.equal(new Set(delivered).size, 3);
  await worker.stop();
});

test("graceful shutdown stops new claims and waits for the active delivery", async () => {
  const store = createOutboxStore();
  store.enqueue(event("job-drain"), { now: 0 });
  let release;
  const delivery = new Promise((resolve) => { release = resolve; });
  let started;
  const didStart = new Promise((resolve) => { started = resolve; });
  const worker = createWorker({
    store,
    shutdownTimeoutMs: 1000,
    handler: async () => {
      started();
      await delivery;
    }
  });

  const tick = worker.tick(0);
  await didStart;
  const stopping = worker.stop();
  assert.equal(worker.isStopping(), true);
  assert.deepEqual(await worker.tick(0), { processed: 0, retried: 0, dead: 0 });
  release();
  await Promise.all([tick, stopping]);
  assert.equal(store.get("job-drain").status, "processed");
});

test("graceful shutdown fails visibly when the active delivery exceeds its bound", async () => {
  const store = createOutboxStore();
  store.enqueue(event("job-timeout"), { now: 0 });
  let release;
  const delivery = new Promise((resolve) => { release = resolve; });
  let started;
  const didStart = new Promise((resolve) => { started = resolve; });
  const worker = createWorker({
    store,
    shutdownTimeoutMs: 10,
    handler: async () => {
      started();
      await delivery;
    }
  });
  const tick = worker.tick(0);
  await didStart;
  await assert.rejects(
    () => worker.stop(),
    (error) => error.code === "worker_shutdown_timeout"
  );
  release();
  await tick;
});

function reportDelivery(id = "worker-email-a") {
  return createEmailDelivery({
    tenantId: "tenant-commercial-sim",
    recipientEmail: "owner@client.invalid",
    kind: "report_ready",
    resourceType: "field_report",
    resourceId: "field-report-commercial-b",
    idempotencyKey: `tenant-commercial-sim:email:${id}`,
    templateData: {
      recipientName: "Client Owner",
      reportTitle: "Approved daily report",
      actionUrl: "http://127.0.0.1:8080/client-portal.html"
    }
  }, { id });
}

test("worker processes durable email jobs through the idempotent local sink and persists audit/status", async () => {
  const repository = createMemoryRepository();
  const store = createOutboxStore();
  const sink = createLocalEmailSink();
  const delivery = reportDelivery();
  await queueEmailDelivery({ repository, outbox: store, delivery });
  const worker = createWorker({ store, repository, emailProvider: sink });
  const result = await worker.tick(Date.now());
  assert.equal(result.processed, 1);
  assert.equal(repository.getEmailDeliveryById(delivery.id).status, "accepted");
  assert.equal(sink.all().length, 1);
  assert.ok(repository.listAuditEventsByTenant(delivery.tenantId).some(
    (event) => event.action === "email.delivery.accepted" && event.resourceId === delivery.id
  ));
  store.patch(`${delivery.id}-outbox`, { status: "pending", nextAttemptAt: new Date().toISOString() });
  assert.equal((await worker.tick(Date.now() + 1)).processed, 1);
  assert.equal(sink.all().length, 1, "accepted replay must not call the provider again");
  await worker.stop();
});

test("email delivery retries safely and reuses the same provider idempotency key", async () => {
  const repository = createMemoryRepository();
  const store = createOutboxStore();
  const sink = createLocalEmailSink();
  const seenKeys = [];
  let attempts = 0;
  const provider = {
    provider: "test-provider",
    async send(delivery, options) {
      seenKeys.push(options.idempotencyKey);
      attempts += 1;
      if (attempts === 1) throw new Error("temporary provider outage");
      return sink.send(delivery, options);
    },
    async checkReadiness() { return { ready: true, provider: "test-provider" }; },
    async close() {}
  };
  const delivery = reportDelivery("worker-email-retry");
  await queueEmailDelivery({ repository, outbox: store, delivery });
  const startedAt = Date.now();
  const worker = createWorker({ store, repository, emailProvider: provider, baseBackoffMs: 100, maxBackoffMs: 100 });
  assert.equal((await worker.tick(startedAt)).retried, 1);
  assert.equal(repository.getEmailDeliveryById(delivery.id).status, "failed");
  assert.equal((await worker.tick(startedAt + 100)).processed, 1);
  assert.equal(repository.getEmailDeliveryById(delivery.id).status, "accepted");
  assert.deepEqual(seenKeys, [delivery.idempotencyKey, delivery.idempotencyKey]);
  assert.equal(sink.all().length, 1);
  await worker.stop();
});

test("worker readiness fails closed when the email provider is unhealthy", async () => {
  const store = createOutboxStore();
  const repository = createMemoryRepository();
  const provider = {
    provider: "test-provider",
    async send() { throw new Error("not used"); },
    async checkReadiness() { return { ready: false, provider: "test-provider", reason: "unavailable" }; },
    async close() {}
  };
  const worker = createWorker({ store, repository, emailProvider: provider });
  await assert.rejects(
    () => worker.checkReadiness({ requireHealthy: true }),
    (error) => error.code === "worker_dependency_not_ready"
  );
  assert.equal((await worker.checkReadiness({ requireHealthy: false })).ready, false);
  await worker.stop();
});

test("permanent email provider failures dead-letter immediately and remain inspectable", async () => {
  const store = createOutboxStore();
  const repository = createMemoryRepository();
  const provider = {
    provider: "test-provider",
    async send() {
      const error = new Error("provider rejected the request");
      error.code = "provider_rejected";
      error.retryable = false;
      throw error;
    },
    async checkReadiness() { return { ready: true, provider: "test-provider" }; },
    async close() {}
  };
  const delivery = reportDelivery("worker-email-permanent-failure");
  await queueEmailDelivery({ repository, outbox: store, delivery });
  const worker = createWorker({ store, repository, emailProvider: provider, maxAttempts: 5 });
  const result = await worker.tick(Date.now());
  assert.equal(result.dead, 1);
  assert.equal(store.get(`${delivery.id}-outbox`).status, "dead");
  assert.equal(repository.getEmailDeliveryById(delivery.id).status, "failed");
  assert.ok(repository.listAuditEventsByTenant(delivery.tenantId).some(
    (event) => event.action === "email.delivery.failed" && event.resourceId === delivery.id
  ));
  await worker.stop();
});
