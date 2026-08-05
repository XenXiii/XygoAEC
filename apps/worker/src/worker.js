import crypto from "node:crypto";

import { createOutboxStoreFromEnv, processOutboxOnce } from "../../api/src/reliability/outbox.js";
import { createRepositoryFromEnv } from "../../api/src/repositories/index.js";
import { rootLogger } from "../../api/src/telemetry/logger.js";
import {
  createEmailDeliveryAuditEvent,
  createEmailProviderFromEnv,
  markEmailDeliveryAccepted,
  markEmailDeliveryFailed,
  markEmailDeliverySending,
  markEmailDeliverySuppressed
} from "../../../packages/email-delivery/src/index.js";
import {
  assertProductionWorkerEnvironment,
  monitoringRuntimeOptionsFromEnvironment,
  workerRuntimeOptionsFromEnvironment
} from "../../../packages/production-config/src/index.js";

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

export function createEmailDeliveryHandler({ repository, provider, auditSigningKey = null, logger = rootLogger }) {
  return async (event) => {
    if (event.eventType !== "email.delivery.requested") {
      return createStagedDeliveryHandler(logger)(event);
    }
    const delivery = await repository.getEmailDeliveryById(event.aggregateId);
    if (!delivery || delivery.tenantId !== event.tenantId) {
      const error = new Error("Email delivery event does not resolve to an in-tenant delivery record.");
      error.code = "email_delivery_not_found";
      error.retryable = false;
      throw error;
    }
    // Once provider acceptance is durably recorded, a worker replay only needs to
    // complete the outbox claim. Re-sending here would unnecessarily depend on a
    // provider's finite idempotency-retention window.
    if (["accepted", "delivered", "bounced", "complained", "suppressed"].includes(delivery.status)) return;

    const suppression = await repository.getEmailSuppression?.(delivery.tenantId, delivery.recipientEmail);
    if (suppression) {
      const suppressed = markEmailDeliverySuppressed(delivery, suppression, { attempt: event.attempt });
      await repository.finalizeEmailDelivery({
        delivery: suppressed,
        auditEventFactory: (previousHash) => createEmailDeliveryAuditEvent(suppressed, {
          action: "email.delivery.suppressed",
          actorId: "email-worker",
          previousHash,
          signingKey: auditSigningKey,
          timestamp: suppressed.updatedAt,
          suffix: `suppression-${suppression.id}`
        })
      });
      logger.info("email.delivery_suppressed", {
        deliveryId: suppressed.id,
        tenantId: suppressed.tenantId,
        kind: suppressed.kind,
        reason: suppression.reason
      });
      return;
    }

    const sending = markEmailDeliverySending(delivery, { attempt: event.attempt });
    await repository.saveEmailDelivery(sending);
    try {
      const result = await provider.send(sending, { idempotencyKey: event.idempotencyKey });
      const accepted = markEmailDeliveryAccepted(sending, {
        provider: provider.provider,
        providerMessageId: result.id
      });
      await repository.finalizeEmailDelivery({
        delivery: accepted,
        auditEventFactory: (previousHash) => createEmailDeliveryAuditEvent(accepted, {
          action: "email.delivery.accepted",
          actorId: "email-worker",
          previousHash,
          signingKey: auditSigningKey,
          timestamp: accepted.updatedAt,
          suffix: "accepted"
        })
      });
      logger.info("email.delivery_accepted", {
        deliveryId: accepted.id,
        tenantId: accepted.tenantId,
        kind: accepted.kind,
        provider: accepted.provider,
        duplicate: result.duplicate === true
      });
    } catch (error) {
      const failed = markEmailDeliveryFailed(sending, error, { attempt: event.attempt });
      await repository.finalizeEmailDelivery({
        delivery: failed,
        auditEventFactory: (previousHash) => createEmailDeliveryAuditEvent(failed, {
          action: "email.delivery.failed",
          actorId: "email-worker",
          previousHash,
          signingKey: auditSigningKey,
          timestamp: failed.updatedAt,
          suffix: `attempt-${failed.attempts}-failed`
        })
      });
      throw error;
    }
  };
}

export function createWorker({
  env = process.env,
  store: injectedStore = null,
  repository: injectedRepository = null,
  emailProvider: injectedEmailProvider = null,
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
  const monitoring = monitoringRuntimeOptionsFromEnvironment(env);
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
  const repository = injectedRepository ?? (handler ? null : createRepositoryFromEnv(env));
  const emailProvider = injectedEmailProvider ?? (handler ? null : createEmailProviderFromEnv(env));
  const deliver = handler ?? createEmailDeliveryHandler({
    repository,
    provider: emailProvider,
    auditSigningKey: env.XYGO_AUDIT_SIGNING_KEY ?? null,
    logger
  });
  let timer = null;
  let stopping = false;
  let activeTick = null;
  let closed = false;

  async function recordHeartbeat(status, details = {}) {
    if (!repository?.recordServiceHeartbeat) return null;
    return repository.recordServiceHeartbeat({
      serviceName: "worker",
      instanceId: workerId,
      status,
      lastSeenAt: new Date().toISOString(),
      details: { backend: store.backend, ...details }
    });
  }

  async function runTick(now = Date.now()) {
    try {
      await recordHeartbeat("ready", { phase: "processing" });
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
      await recordHeartbeat("ready", { phase: "idle", ...result });
      if (result.processed || result.retried || result.dead) logger.info("outbox.tick", { workerId, ...result });
      return result;
    } catch (error) {
      await recordHeartbeat("degraded", { code: error?.code ?? "worker_tick_failed" }).catch(() => {});
      throw error;
    }
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
    try {
      const [outbox, emailProviderHealth, emailDelivery] = await Promise.all([
        store.checkReadiness({
          staleAfterMs: options.staleAfterMs,
          maxDeadJobs: options.maxDeadJobs,
          requireHealthy
        }),
        emailProvider?.checkReadiness?.() ?? { ready: true, provider: "custom" },
        repository?.checkEmailDeliveryReadiness?.({
          staleAfterMs: monitoring.emailStaleAfterMs,
          maxFailed: monitoring.emailFailedMax,
          requireHealthy
        }) ?? { ready: true }
      ]);
      const ready = [outbox, emailProviderHealth, emailDelivery].every((component) => component.ready === true);
      if (requireHealthy && !ready) {
        const error = new Error("Worker dependency readiness failed.");
        error.code = "worker_dependency_not_ready";
        error.readiness = { outbox, emailProvider: emailProviderHealth, emailDelivery };
        throw error;
      }
      await recordHeartbeat(ready ? "ready" : "degraded", { phase: "startup", ready });
      return { ready, outbox, emailProvider: emailProviderHealth, emailDelivery };
    } catch (error) {
      await recordHeartbeat("degraded", { phase: "startup", code: error?.code ?? "worker_dependency_not_ready" }).catch(() => {});
      throw error;
    }
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
      void recordHeartbeat("ready", { phase: "idle" }).catch((error) => logger.error("worker.heartbeat_failed", {
        workerId,
        code: error?.code ?? "worker_heartbeat_failed"
      }));
      return this;
    },
    async stop() {
      if (closed) return;
      stopping = true;
      await recordHeartbeat("stopping", { phase: "shutdown" }).catch(() => {});
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
        await Promise.all([
          store.close(),
          repository?.close?.(),
          emailProvider?.close?.()
        ]);
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
