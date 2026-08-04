import test from "node:test";
import assert from "node:assert/strict";

import { createOutboxEvent } from "../../../packages/audit/src/foundation.js";
import { createOutboxStore } from "../../api/src/reliability/outbox.js";
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
