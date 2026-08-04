#!/usr/bin/env node
import { createOutboxStoreFromEnv } from "../apps/api/src/reliability/outbox.js";
import { workerRuntimeOptionsFromEnvironment } from "../packages/production-config/src/index.js";

const options = workerRuntimeOptionsFromEnvironment(process.env);
const store = createOutboxStoreFromEnv(process.env, { service: "outbox-readiness" });
try {
  const health = await store.checkReadiness({
    staleAfterMs: options.staleAfterMs,
    maxDeadJobs: options.maxDeadJobs,
    requireHealthy: true
  });
  process.stdout.write(`${JSON.stringify(health)}\n`);
} finally {
  await store.close();
}
