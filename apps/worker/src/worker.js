import { processOutboxOnce, sharedOutbox } from "../../api/src/reliability/outbox.js";
import { rootLogger } from "../../api/src/telemetry/logger.js";

// Staged delivery handler: NO external side effects (guardrail). "Delivery" is a
// structured log line. Swap for a real dispatcher once external adapters are
// approved for production.
export function createStagedDeliveryHandler(logger = rootLogger) {
  return async (event) => {
    logger.info("outbox.delivered", {
      staged: true,
      eventId: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      tenantId: event.tenantId ?? null
    });
  };
}

export function createWorker({
  store = sharedOutbox,
  handler,
  intervalMs = 1000,
  logger = rootLogger,
  maxAttempts = 5,
  baseBackoffMs = 1000
} = {}) {
  const deliver = handler ?? createStagedDeliveryHandler(logger);
  const processed = new Set();
  let timer = null;
  let stopping = false;

  async function tick(now = Date.now()) {
    if (stopping) {
      return { processed: 0, retried: 0, dead: 0 };
    }
    const result = await processOutboxOnce({ store, handler: deliver, now, maxAttempts, baseBackoffMs, processed });
    if (result.processed || result.retried || result.dead) {
      logger.info("outbox.tick", result);
    }
    return result;
  }

  return {
    tick,
    start() {
      timer = setInterval(() => {
        tick().catch((error) => logger.error("outbox.tick_failed", { error: String(error?.message ?? error) }));
      }, intervalMs);
      // Note: not unref'd — the standalone worker process must stay alive.
      logger.info("worker.started", { intervalMs });
      return this;
    },
    async stop() {
      stopping = true;
      if (timer) {
        clearInterval(timer);
      }
      logger.info("worker.stopped");
    }
  };
}

if (process.argv[1] && process.argv[1].endsWith("/worker.js")) {
  const worker = createWorker({ intervalMs: Number(process.env.XYGO_WORKER_INTERVAL_MS ?? 1000) }).start();
  const shutdown = async () => {
    await worker.stop();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
