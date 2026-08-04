#!/usr/bin/env node
import { createOutboxStoreFromEnv } from "../apps/api/src/reliability/outbox.js";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const tenantId = option("--tenant-id");
const jobId = option("--job-id");
const reason = option("--reason");
if (!tenantId || !jobId || !reason) {
  throw new Error("--tenant-id, --job-id, and --reason are required to replay a dead outbox job.");
}

const store = createOutboxStoreFromEnv(process.env, { service: "outbox-replay" });
try {
  const replayed = await store.replay({ id: jobId, tenantId, reason });
  if (!replayed) throw new Error("Dead outbox job was not found for the supplied tenant and id.");
  process.stdout.write(`${JSON.stringify({
    id: replayed.id,
    tenantId: replayed.tenantId,
    status: replayed.status,
    replayCount: replayed.replayCount,
    nextAttemptAt: replayed.nextAttemptAt
  })}\n`);
} finally {
  await store.close();
}
