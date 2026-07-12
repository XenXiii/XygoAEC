import test from "node:test";
import assert from "node:assert/strict";

import { createIdempotencyStore, idempotencyKeyFor } from "../src/reliability/idempotency.js";
import { createOutboxStore, processOutboxOnce } from "../src/reliability/outbox.js";
import { createWorker } from "../../worker/src/worker.js";
import { createOutboxEvent } from "../../../packages/audit/src/foundation.js";
import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

// --- idempotency store --------------------------------------------------------

test("idempotency store returns cached response until TTL expires", () => {
  const store = createIdempotencyStore({ ttlMs: 1000 });
  const key = idempotencyKeyFor({ tenantId: "t", path: "/x", clientKey: "k" });
  assert.equal(store.get(key, 0), null);
  store.set(key, { status: 201 }, 0);
  assert.equal(store.get(key, 500).status, 201);
  assert.equal(store.get(key, 1000), null); // expired
});

// --- outbox -------------------------------------------------------------------

function event(id) {
  return createOutboxEvent({ id, eventType: "x.created", aggregateType: "x", aggregateId: id });
}

test("outbox delivers pending events once", async () => {
  const store = createOutboxStore();
  store.enqueue(event("e1"));
  const delivered = [];
  const r = await processOutboxOnce({ store, handler: async (e) => delivered.push(e.id), now: 0 });
  assert.deepEqual(delivered, ["e1"]);
  assert.equal(r.processed, 1);
  assert.equal(store.get("e1").status, "processed");
});

test("outbox retries with backoff then dead-letters after max attempts", async () => {
  const store = createOutboxStore();
  store.enqueue(event("e1"));
  const failing = async () => {
    throw new Error("boom");
  };

  const r1 = await processOutboxOnce({ store, handler: failing, now: 0, maxAttempts: 2, baseBackoffMs: 1000 });
  assert.equal(r1.retried, 1);
  assert.equal(store.get("e1").status, "failed");
  assert.equal(store.get("e1").nextAttemptAt, 1000);

  // Not yet ready before backoff elapses.
  assert.equal(store.ready(500).length, 0);

  const r2 = await processOutboxOnce({ store, handler: failing, now: 1000, maxAttempts: 2, baseBackoffMs: 1000 });
  assert.equal(r2.dead, 1);
  assert.equal(store.get("e1").status, "dead");
});

test("outbox processing is idempotent (no double delivery)", async () => {
  const store = createOutboxStore();
  store.enqueue(event("e1"));
  const processed = new Set();
  let deliveries = 0;
  const handler = async () => {
    deliveries += 1;
  };

  await processOutboxOnce({ store, handler, now: 0, processed });
  // Simulate the record reappearing as pending; the processed guard must skip it.
  store.patch("e1", { status: "pending" });
  await processOutboxOnce({ store, handler, now: 0, processed });

  assert.equal(deliveries, 1);
  assert.equal(store.get("e1").status, "processed");
});

test("worker tick drains the outbox and can be stopped", async () => {
  const store = createOutboxStore();
  store.enqueue(event("e1"));
  const delivered = [];
  const worker = createWorker({ store, handler: async (e) => delivered.push(e.id) });

  await worker.tick(0);
  assert.deepEqual(delivered, ["e1"]);

  await worker.stop();
  store.enqueue(event("e2"));
  await worker.tick(0); // no-op after stop
  assert.deepEqual(delivered, ["e1"]);
});

// --- idempotency wired through the API ----------------------------------------

test("repeated POST with same Idempotency-Key writes once and replays the response", async () => {
  const repository = createMemoryRepository();
  const outbox = createOutboxStore();
  const idempotency = createIdempotencyStore();
  const T = "tenant-commercial-sim";

  const requestOnce = () =>
    handleApiRequest({
      method: "POST",
      path: `/v1/tenants/${T}/issues`,
      headers: { "x-staged-tenant-id": T, "idempotency-key": "abc-123" },
      body: JSON.stringify({ id: "issue-idem", projectId: "project-commercial-b", title: "t", description: "d" }),
      repository,
      outbox,
      idempotency
    });

  const first = await requestOnce();
  const second = await requestOnce();

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(second.body, first.body);

  // Exactly one issue persisted and one outbox event enqueued despite two calls.
  const issues = repository.listIssuesByTenant(T).filter((i) => i.id === "issue-idem");
  assert.equal(issues.length, 1);
  assert.equal(outbox.all().length, 1);
});

test("create without Idempotency-Key still enqueues an outbox event", async () => {
  const repository = createMemoryRepository();
  const outbox = createOutboxStore();
  const T = "tenant-commercial-sim";

  const res = await handleApiRequest({
    method: "POST",
    path: `/v1/tenants/${T}/issues`,
    headers: { "x-staged-tenant-id": T },
    body: JSON.stringify({ id: "issue-nokey", projectId: "project-commercial-b", title: "t", description: "d" }),
    repository,
    outbox
  });

  assert.equal(res.status, 201);
  assert.equal(outbox.all().length, 1);
  assert.equal(outbox.all()[0].event.aggregateId, "issue-nokey");
});
