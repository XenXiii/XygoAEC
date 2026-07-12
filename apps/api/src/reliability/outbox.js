// Transactional-outbox primitive. Writes enqueue a durable event; a worker drains
// it with at-least-once delivery, exponential backoff, a max-attempts dead-letter,
// and idempotent processing (a processed-id set guards against double delivery).
//
// This in-memory store is for single-process use and tests. Cross-process,
// crash-durable delivery requires the Postgres-backed outbox table (Phase 2 DB) —
// the store interface here is what that backend will implement.
export function createOutboxStore() {
  const items = new Map(); // id -> { event, status, attempts, nextAttemptAt, lastError }

  return {
    enqueue(event) {
      items.set(event.id, { event, status: "pending", attempts: 0, nextAttemptAt: 0, lastError: null });
      return event;
    },
    ready(now = Date.now()) {
      return [...items.values()].filter(
        (r) => (r.status === "pending" || r.status === "failed") && r.nextAttemptAt <= now
      );
    },
    get(id) {
      return items.get(id) ?? null;
    },
    all() {
      return [...items.values()];
    },
    patch(id, changes) {
      const record = items.get(id);
      if (record) {
        Object.assign(record, changes);
      }
    }
  };
}

export async function processOutboxOnce({
  store,
  handler,
  now = Date.now(),
  maxAttempts = 5,
  baseBackoffMs = 1000,
  processed = new Set()
}) {
  const result = { processed: 0, retried: 0, dead: 0 };

  for (const record of store.ready(now)) {
    const { id } = record.event;

    // Idempotent: never deliver the same event twice.
    if (processed.has(id)) {
      store.patch(id, { status: "processed" });
      continue;
    }

    try {
      await handler(record.event);
      processed.add(id);
      store.patch(id, { status: "processed" });
      result.processed += 1;
    } catch (error) {
      const attempts = record.attempts + 1;
      const message = String(error?.message ?? error);
      if (attempts >= maxAttempts) {
        store.patch(id, { status: "dead", attempts, lastError: message });
        result.dead += 1;
      } else {
        const backoff = baseBackoffMs * 2 ** (attempts - 1);
        store.patch(id, { status: "failed", attempts, nextAttemptAt: now + backoff, lastError: message });
        result.retried += 1;
      }
    }
  }

  return result;
}

// Shared per-process instance the API enqueues into (and an in-process worker can
// drain). Exported so tests and the worker reference the same queue.
export const sharedOutbox = createOutboxStore();
