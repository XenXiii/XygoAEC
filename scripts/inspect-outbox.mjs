#!/usr/bin/env node
import { createOutboxStoreFromEnv } from "../apps/api/src/reliability/outbox.js";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const tenantId = option("--tenant-id");
const status = option("--status");
if (!tenantId) throw new Error("--tenant-id is required; global outbox payload listing is forbidden.");

const store = createOutboxStoreFromEnv(process.env, { service: "outbox-inspect" });
try {
  const jobs = await store.list({ tenantId, status });
  const safe = jobs.map((job) => ({
    id: job.id,
    tenantId: job.tenantId,
    eventType: job.event.eventType,
    aggregateType: job.event.aggregateType,
    aggregateId: job.event.aggregateId,
    status: job.status,
    attempts: job.attempts,
    nextAttemptAt: job.nextAttemptAt,
    lastError: job.lastError,
    replayCount: job.replayCount,
    lastReplayReason: job.lastReplayReason,
    updatedAt: job.updatedAt
  }));
  process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
} finally {
  await store.close();
}
