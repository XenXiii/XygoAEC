import crypto from "node:crypto";

import { createOutboxStoreFromEnv, processOutboxOnce } from "../../api/src/reliability/outbox.js";
import { rootLogger } from "../../api/src/telemetry/logger.js";
import {
  assertProductionWorkerEnvironment,
  workerRuntimeOptionsFromEnvironment
} from "../../../packages/production-config/src/index.js";

// This slice deliberately has no SMTP, storage-processing, malware, or monitoring
// provider dispatcher. Delivery records the durable domain event only; future
// provider handlers must preserve event.idempotencyKey when they are introduced.
export function createStagedDeliveryHandler(logger = rootLogger) {
  return async (event) => {
    logger.info("outbox.delivered", {
      staged: true,
      eventId: event.id,
      idempotencyKey: event.idempotencyKey,
      attempt: event.attempt,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      tenantId: event.tenantId ?? null
    });
  };
}

export function createWorker({
  env = process.env,
  store: injectedStore = null,
  handler,
  logger = rootLogger,
  workerId = `worker-${process.pid}-${crypto.randomUUID()}`,
  intervalMs,
  maxAttempts,
  baseBackoffMs,
  maxBackoffMs,
  concurrency,
  staleAfterMs,
  shutdownTimeoutMs,
  maxDeadJobs
} = {}) {
  assertProductionWorkerEnvironment(env);
  const configured = workerRuntimeOptionsFromEnvironment(env);
  const options = {
    intervalMs: intervalMs ?? configured.intervalMs,
    maxAttempts: maxAttempts ?? configured.maxAttempts,
    baseBackoffMs: baseBackoffMs ?? configured.baseBackoffMs,
    maxBackoffMs: maxBackoffMs ?? configured.maxBackoffMs,
    concurrency: concurrency ?? configured.concurrency,
    staleAfterMs: staleAfterMs ?? configured.staleAfterMs,
    shutdownTimeoutMs: shutdownTimeoutMs ?? configured.shutdownTimeoutMs,
    maxDeadJobs: maxDeadJobs ?? configured.maxDeadJobs
  };
  if (options.maxBackoffMs < options.baseBackoffMs) {
    throw new Error("Worker maxBackoffMs must be greater than or equal to baseBackoffMs.");
  }
  const store = injectedStore ?? createOutboxStoreFromEnv(env, { service: "worker" });
  const deliver = handler ?? createStagedDeliveryHandler(logger);
  let timer = null;
  let stopping = false;
  let activeTick = null;
  let closed = false;

  async function runTick(now = Date.now()) {
    const result = await processOutboxOnce({
      store,
      handler: deliver,
      now,
      maxAttempts: options.maxAttempts,
      baseBackoffMs: options.baseBackoffMs,
      maxBackoffMs: options.maxBackoffMs,
      concurrency: options.concurrency,
      staleAfterMs: options.staleAfterMs,
      workerId
    });
    if (result.processed || result.retried || result.dead) logger.info("outbox.tick", { workerId, ...result });
    return result;
  }

  async function tick(now = Date.now()) {
    if (stopping || closed) return { processed: 0, retried: 0, dead: 0 };
    if (activeTick) return activeTick;
    activeTick = runTick(now).finally(() => {
      activeTick = null;
    });
    return activeTick;
  }

  async function checkReadiness({ requireHealthy = true } = {}) {
    return store.checkReadiness({
      staleAfterMs: options.staleAfterMs,
      maxDeadJobs: options.maxDeadJobs,
      requireHealthy
    });
  }

  return {
    workerId,
    store,
    options: { ...options },
    tick,
    checkReadiness,
    start() {
      if (timer || stopping || closed) return this;
      timer = setInterval(() => {
        tick().catch((error) => logger.error("outbox.tick_failed", {
          workerId,
          code: error?.code ?? "outbox_tick_failed",
          error: String(error?.message ?? error)
        }));
      }, options.intervalMs);
      logger.info("worker.started", {
        workerId,
        backend: store.backend,
        intervalMs: options.intervalMs,
        concurrency: options.concurrency
      });
      return this;
    },
    async stop() {
      if (closed) return;
      stopping = true;
      if (timer) clearInterval(timer);
      timer = null;
      let shutdownError = null;
      if (activeTick) {
        let timeout;
        try {
          await Promise.race([
            activeTick,
            new Promise((_, reject) => {
              timeout = setTimeout(() => {
                const error = new Error("Worker graceful shutdown timed out with a job still in flight.");
                error.code = "worker_shutdown_timeout";
                reject(error);
              }, options.shutdownTimeoutMs);
            })
          ]);
        } catch (error) {
          shutdownError = error;
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      }
      try {
        await store.close();
      } catch (error) {
        shutdownError ??= error;
      }
      closed = true;
      logger.info("worker.stopped", { workerId, graceful: !shutdownError });
      if (shutdownError) throw shutdownError;
    },
    isStopping() {
      return stopping;
    }
  };
}

if (process.argv[1] && process.argv[1].endsWith("/worker.js")) {
  const worker = createWorker();
  await worker.checkReadiness({ requireHealthy: true });
  worker.start();
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await worker.stop();
      process.exitCode = 0;
    } catch (error) {
      rootLogger.error("worker.shutdown_failed", {
        signal,
        code: error?.code ?? "worker_shutdown_failed",
        error: String(error?.message ?? error)
      });
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
