import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createOutboxEvent } from "../../../packages/audit/src/foundation.js";
import {
  createOutboxStore,
  createSqliteOutboxStore,
  enqueueOutboxEvent,
  processOutboxOnce
} from "../src/reliability/outbox.js";

function event(id, tenantId = "tenant-commercial-sim") {
  return createOutboxEvent({
    id,
    tenantId,
    eventType: "report.delivery.requested",
    aggregateType: "field_report",
    aggregateId: `report-${id}`,
    payload: { reportId: `report-${id}` },
    occurredAt: "2026-08-04T00:00:00.000Z"
  });
}

test("enqueue idempotency collapses duplicates while preserving tenant-scoped inspection", async () => {
  const store = createOutboxStore();
  const first = await enqueueOutboxEvent(store, event("job-a"), { idempotencyKey: "tenant-a:report:1", now: 0 });
  const duplicate = await enqueueOutboxEvent(store, { ...event("job-a"), id: "job-b" }, {
    idempotencyKey: "tenant-a:report:1",
    now: 1
  });
  await enqueueOutboxEvent(store, event("job-c", "tenant-residential-sim"), { now: 0 });

  assert.equal(duplicate.id, first.id);
  await assert.rejects(
    () => enqueueOutboxEvent(store, event("job-conflict", "tenant-residential-sim"), {
      idempotencyKey: "tenant-a:report:1",
      now: 2
    }),
    (error) => error.code === "outbox_idempotency_conflict"
  );
  assert.equal(store.all().length, 2);
  assert.deepEqual(store.list({ tenantId: "tenant-commercial-sim" }).map((job) => job.id), ["job-a"]);
  assert.deepEqual(store.list({ tenantId: "tenant-residential-sim" }).map((job) => job.id), ["job-c"]);
});

test("claim, bounded retry, dead-letter readiness, and tenant-bound replay are recoverable", async () => {
  const store = createOutboxStore();
  await enqueueOutboxEvent(store, event("job-retry"), { now: 0 });
  const failing = async () => { throw new Error("provider unavailable"); };

  const first = await processOutboxOnce({
    store,
    handler: failing,
    now: 0,
    workerId: "worker-a",
    maxAttempts: 2,
    baseBackoffMs: 1000,
    maxBackoffMs: 1000
  });
  assert.equal(first.retried, 1);
  assert.equal(store.get("job-retry").nextAttemptAt, "1970-01-01T00:00:01.000Z");

  const second = await processOutboxOnce({
    store,
    handler: failing,
    now: 1000,
    workerId: "worker-b",
    maxAttempts: 2,
    baseBackoffMs: 1000,
    maxBackoffMs: 1000
  });
  assert.equal(second.dead, 1);
  await assert.rejects(() => store.checkReadiness({ maxDeadJobs: 0, requireHealthy: true }), /Outbox is unhealthy/);
  assert.equal(await store.replay({
    id: "job-retry",
    tenantId: "tenant-residential-sim",
    reason: "wrong tenant"
  }), null);
  const replayed = await store.replay({
    id: "job-retry",
    tenantId: "tenant-commercial-sim",
    reason: "provider recovered",
    now: 2000
  });
  assert.equal(replayed.status, "pending");
  assert.equal(replayed.replayCount, 1);
  assert.equal(replayed.lastReplayReason, "provider recovered");
  assert.equal((await store.checkReadiness({ maxDeadJobs: 0 })).ready, true);
});

test("stale processing claims are safely reclaimed with an incremented attempt", async () => {
  const store = createOutboxStore();
  await enqueueOutboxEvent(store, event("job-stale"), { now: 0 });
  const first = await store.claim({ workerId: "worker-crashed", now: 0, limit: 1, staleAfterMs: 1000 });
  assert.equal(first[0].attempts, 1);
  assert.equal((await store.claim({ workerId: "worker-early", now: 999, limit: 1, staleAfterMs: 1000 })).length, 0);
  const reclaimed = await store.claim({ workerId: "worker-recovery", now: 1000, limit: 1, staleAfterMs: 1000 });
  assert.equal(reclaimed[0].attempts, 2);
  assert.equal(reclaimed[0].lockedBy, "worker-recovery");
});

test("SQLite outbox survives reopen and serializes claims across local API/worker connections", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-outbox-sqlite-"));
  const filePath = path.join(directory, "outbox.sqlite");
  const apiStore = createSqliteOutboxStore({ filePath });
  const workerStore = createSqliteOutboxStore({ filePath });
  t.after(async () => {
    await Promise.all([apiStore.close(), workerStore.close()]);
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await enqueueOutboxEvent(apiStore, event("job-sqlite"), { now: 0 });
  const claimed = await workerStore.claim({ workerId: "worker-local", now: 0, limit: 1, staleAfterMs: 1000 });
  assert.equal(claimed.length, 1);
  assert.equal((await apiStore.claim({ workerId: "api-local", now: 0, limit: 1, staleAfterMs: 1000 })).length, 0);
  await workerStore.complete({ id: "job-sqlite", workerId: "worker-local", now: 1 });
  assert.equal((await apiStore.get("job-sqlite")).status, "processed");
});
