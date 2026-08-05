import http from "node:http";
import crypto from "node:crypto";

import { handleApiRequest } from "./handlers.js";
import { createRepositoryFromEnv } from "./repositories/index.js";
import { buildTenantEventSnapshot, formatSseEvent } from "./realtime.js";
import { assertAuthConfig, loadAuthConfig } from "./auth/config.js";
import { createRemoteJwks } from "./auth/jwks.js";
import { resolvePrincipal } from "./auth/principal.js";
import { AuthError } from "./auth/jwt.js";
import { baseResponseHeaders, CORS_HEADERS } from "./http/headers.js";
import { createRateLimiter } from "./http/rate-limit.js";
import { createMetrics } from "./telemetry/metrics.js";
import { rootLogger } from "./telemetry/logger.js";
import { assertStagedMode } from "../../../packages/staged-mode/src/index.js";
import {
  assertProductionApiEnvironment,
  monitoringRuntimeOptionsFromEnvironment
} from "../../../packages/production-config/src/index.js";
import { createStorageFromEnv } from "../../../packages/file-storage/src/index.js";
import { createOutboxStoreFromEnv } from "./reliability/outbox.js";
import { handleEmailWebhook } from "./email-webhook.js";

function sendJson(res, status, body, extraHeaders = {}) {
  if (res.headersSent) {
    return;
  }
  res.writeHead(status, baseResponseHeaders({ "content-type": "application/json", ...extraHeaders }));
  res.end(JSON.stringify(body));
}

function sendResult(res, result) {
  if (Buffer.isBuffer(result.body)) {
    if (res.headersSent) return;
    res.writeHead(result.status, result.headers);
    res.end(result.body);
    return;
  }
  sendJson(res, result.status, result.body, result.headers);
}

function authErrorResponse(res, error) {
  sendJson(res, 401, { error: "unauthorized", message: error.message, code: error.code, staged: true });
}

function rateLimitKey(req) {
  return req.headers["x-staged-tenant-id"] ?? req.headers.authorization ?? req.socket?.remoteAddress ?? "anonymous";
}

export function createServer({
  env = process.env,
  logger = rootLogger,
  metrics = createMetrics(),
  repository: injectedRepository = null,
  storage: injectedStorage = null,
  outbox: injectedOutbox = null,
  jwks: injectedJwks = null
} = {}) {
  assertProductionApiEnvironment(env);
  const authConfig = loadAuthConfig(env);
  const repositoryMode = env.XYGO_API_REPOSITORY_MODE ?? "sqlite";
  assertAuthConfig(authConfig, { repositoryMode });
  if (authConfig.mode === "staged") {
    assertStagedMode({ STAGED_MODE: authConfig.stagedModeEnabled });
  }

  const jwks = authConfig.mode === "oidc"
    ? (injectedJwks ?? createRemoteJwks({ jwksUri: authConfig.oidc.jwksUri }))
    : null;
  const repository = injectedRepository ?? createRepositoryFromEnv(env);
  const storage = injectedStorage ?? createStorageFromEnv(env);
  const outbox = injectedOutbox ?? createOutboxStoreFromEnv(env, { service: "api" });
  const monitoringOptions = monitoringRuntimeOptionsFromEnvironment(env);

  const maxBodyBytes = Number(env.XYGO_MAX_BODY_BYTES ?? 1_048_576);
  const requestTimeoutMs = Number(env.XYGO_REQUEST_TIMEOUT_MS ?? 15_000);
  const rateLimiter = createRateLimiter({
    windowMs: Number(env.XYGO_RATE_LIMIT_WINDOW_MS ?? 60_000),
    max: Number(env.XYGO_RATE_LIMIT_MAX ?? 300)
  });

  let shuttingDown = false;
  let inFlight = 0;

  const checkReadiness = async () => {
    if (shuttingDown) {
      const error = new Error("Server is draining.");
      error.code = "server_draining";
      throw error;
    }
    const requireHealthy = env.NODE_ENV === "production" || env.STAGED_MODE === "false";
    const capture = async (operation) => {
      try {
        return { readiness: await operation, error: null };
      } catch (error) {
        return {
          readiness: { ready: false, reason: error?.code ?? "dependency_not_ready" },
          error
        };
      }
    };
    const checks = await Promise.all([
      capture(typeof repository.checkReadiness === "function" ? repository.checkReadiness() : { ready: true }),
      capture(typeof storage.checkReadiness === "function" ? storage.checkReadiness() : { ready: true }),
      capture(outbox.checkReadiness({
        staleAfterMs: Number(env.XYGO_WORKER_STALE_AFTER_MS ?? 60_000),
        maxDeadJobs: Number(env.XYGO_WORKER_MAX_DEAD_JOBS ?? 0),
        maxBacklog: monitoringOptions.outboxBacklogMax,
        oldestPendingMs: monitoringOptions.outboxOldestPendingMs,
        requireHealthy: false
      })),
      capture(repository.checkEmailDeliveryReadiness?.({
        staleAfterMs: monitoringOptions.emailStaleAfterMs,
        maxFailed: monitoringOptions.emailFailedMax,
        requireHealthy: false
      }) ?? { ready: true, supported: false }),
      capture(repository.checkWorkerReadiness?.({
        staleAfterMs: monitoringOptions.workerHeartbeatStaleMs,
        requireHealthy: false
      }) ?? { ready: !requireHealthy, supported: false })
    ]);
    let [databaseReadiness, storageReadiness, outboxReadiness, emailReadiness, workerReadiness] = checks.map(
      (check) => check.readiness
    );
    if (databaseReadiness.ready && databaseReadiness.latencyMs > monitoringOptions.databaseLatencyMs) {
      databaseReadiness = {
        ...databaseReadiness,
        ready: false,
        reason: "database_latency_unhealthy"
      };
    }
    const dependencies = {
      database: databaseReadiness,
      storage: storageReadiness,
      outbox: outboxReadiness,
      worker: workerReadiness,
      email_delivery: emailReadiness
    };
    for (const [dependency, readiness] of Object.entries(dependencies)) {
      metrics.setGauge?.("xygo_dependency_ready", { dependency }, readiness.ready === true ? 1 : 0);
    }
    metrics.setGauge?.("xygo_outbox_backlog", {}, outboxReadiness.backlog ?? 0);
    metrics.setGauge?.("xygo_email_delivery_failures", {}, emailReadiness.failures ?? 0);

    const hardFailure = checks.find((check) => check.error)?.error;
    if (hardFailure) throw hardFailure;
    const unhealthy = Object.entries(dependencies).find(([, readiness]) => readiness.ready !== true);
    if (requireHealthy && unhealthy) {
      const [dependency, readiness] = unhealthy;
      const error = new Error(`${dependency} readiness failed.`);
      error.code = readiness.reason ?? `${dependency}_unhealthy`;
      error.readiness = dependencies;
      throw error;
    }
    return {
      ready: true,
      api: { ready: true, release: env.XYGO_RELEASE ?? "local" },
      database: databaseReadiness,
      storage: storageReadiness,
      outbox: outboxReadiness,
      worker: workerReadiness,
      emailDelivery: emailReadiness
    };
  };

  const server = http.createServer((req, res) => {
    const start = process.hrtime.bigint();
    const requestId = req.headers["x-request-id"] ?? crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    inFlight += 1;

    res.on("finish", () => {
      inFlight -= 1;
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      metrics.recordRequest({ method: req.method, status: res.statusCode, durationMs });
      logger.info("http.request", {
        requestId,
        method: req.method,
        path: (req.url ?? "/").split("?")[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        tenant: req.headers["x-staged-tenant-id"] ?? null
      });
    });

    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    // Observability / lifecycle endpoints — public, no auth, bypass rate limit.
    if (req.method === "GET" && path === "/health") {
      sendJson(res, 200, { status: "ok", staged: true });
      return;
    }
    if (req.method === "GET" && path === "/ready") {
      checkReadiness()
        .then((readiness) => sendJson(res, 200, { ...readiness, staged: true }))
        .catch((error) => {
          const reason = error?.code ?? "dependency_not_ready";
          logger.warn?.("server.readiness_failed", { code: reason });
          sendJson(res, 503, { ready: false, reason, staged: true });
        });
      return;
    }
    if (req.method === "GET" && path === "/metrics") {
      // Refresh dependency gauges on every scrape. A failed dependency still
      // returns metrics (with a zero gauge) so alerting is not blinded.
      checkReadiness()
        .catch(() => null)
        .finally(() => {
          res.writeHead(200, baseResponseHeaders({ "content-type": "text/plain; version=0.0.4" }));
          res.end(metrics.render());
        });
      return;
    }

    // Reject new work once draining.
    if (shuttingDown) {
      sendJson(res, 503, { error: "shutting_down", message: "Server is draining.", staged: true });
      return;
    }

    const decision = rateLimiter.check(rateLimitKey(req));
    if (!decision.allowed) {
      metrics.inc("xygo_rate_limited_total");
      sendJson(res, 429, { error: "rate_limited", message: "Too many requests.", staged: true }, {
        "retry-after": String(decision.retryAfterSec),
        "x-ratelimit-limit": String(decision.limit),
        "x-ratelimit-remaining": String(decision.remaining)
      });
      return;
    }

    const parts = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    const isStream =
      req.method === "GET" && parts[0] === "v1" && parts[1] === "tenants" && parts[2] && parts[3] === "events" && parts[4] === "stream";

    if (isStream) {
      const tenantId = parts[2];
      resolvePrincipal({
        headers: req.headers,
        searchParams: url.searchParams,
        config: authConfig,
        jwks,
        repository,
        allowQueryAuth: true
      })
        .then((principal) => {
          if (!principal?.tenantId || principal.tenantId !== tenantId) {
            sendJson(res, 403, { error: "forbidden", message: "Tenant access denied.", staged: true });
            return;
          }
          res.writeHead(200, baseResponseHeaders({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" }));
          res.write(formatSseEvent({ event: "snapshot", data: buildTenantEventSnapshot({ tenantId, repository }) }));
          const timer = setInterval(() => {
            res.write(formatSseEvent({ event: "heartbeat", data: buildTenantEventSnapshot({ tenantId, repository }) }));
          }, 5000);
          req.on("close", () => clearInterval(timer));
        })
        .catch((error) => {
          if (error instanceof AuthError) {
            authErrorResponse(res, error);
          } else {
            sendJson(res, 500, { error: "internal_error", message: "Stream setup failed.", staged: true });
          }
        });
      return;
    }

    const timeout = setTimeout(() => {
      sendJson(res, 408, { error: "request_timeout", message: "Request timed out.", staged: true });
      req.destroy();
    }, requestTimeoutMs);

    const chunks = [];
    let received = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) {
        return;
      }
      received += chunk.length;
      const isLocalFileContent = req.method === "PUT" && /^\/v1\/tenants\/[^/]+\/files\/[^/]+\/content$/.test(path);
      const requestBodyLimit = isLocalFileContent ? storage.configuration.maxFileBytes : maxBodyBytes;
      if (received > requestBodyLimit) {
        aborted = true;
        clearTimeout(timeout);
        sendJson(res, 413, { error: "payload_too_large", message: "Request body exceeds limit.", staged: true });
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });

    req.on("end", () => {
      if (aborted) {
        return;
      }
      clearTimeout(timeout);
      const isFileContent = req.method === "PUT" && /^\/v1\/tenants\/[^/]+\/files\/[^/]+\/content$/.test(path);
      const combinedBody = chunks.length > 0 ? Buffer.concat(chunks) : null;
      const body = isFileContent ? (combinedBody ?? Buffer.alloc(0)) : combinedBody?.toString("utf8") ?? null;

      if (req.method === "POST" && path === "/webhooks/email") {
        if (String(env.XYGO_EMAIL_TRANSPORT ?? "sink").toLowerCase() !== "resend") {
          sendJson(res, 404, { error: "not_found", message: "Email webhook is not configured.", staged: true });
          return;
        }
        handleEmailWebhook({
          rawBody: body ?? "",
          headers: req.headers,
          repository,
          webhookSecret: env.XYGO_EMAIL_WEBHOOK_SECRET,
          auditSigningKey: env.XYGO_AUDIT_SIGNING_KEY ?? null
        })
          .then((result) => sendJson(res, result.status, result.body))
          .catch((error) => {
            logger.error?.("email.webhook_failed", { code: error?.code ?? "email_webhook_failed" });
            sendJson(res, 500, { error: "internal_error", message: "Email webhook processing failed.", staged: true });
          });
        return;
      }

      resolvePrincipal({ headers: req.headers, config: authConfig, jwks, repository })
        .then(async (principal) => {
          const result = await handleApiRequest({
            method: req.method,
            path: req.url ?? "/",
            headers: req.headers,
            body,
            repository,
            storage,
            outbox,
            principal,
            authConfig,
            auditSigningKey: env.XYGO_AUDIT_SIGNING_KEY ?? null,
            webAppUrl: env.XYGO_WEB_APP_URL ?? "http://127.0.0.1:8080"
          });
          sendResult(res, result);
        })
        .catch((error) => {
          if (error instanceof AuthError) {
            authErrorResponse(res, error);
          } else {
            sendJson(res, 500, { error: "internal_error", message: "Staged runtime failed to process the request.", staged: true });
          }
        });
    });

    req.on("error", () => clearTimeout(timeout));
  });

  // Graceful shutdown: stop accepting, drain in-flight, then close.
  server.beginShutdown = ({ onDrained } = {}) => {
    shuttingDown = true;
    logger.info("server.shutdown_initiated", { inFlight });
    server.close(() => {
      Promise.all([
        Promise.resolve(typeof repository.close === "function" ? repository.close() : null),
        Promise.resolve(typeof storage.close === "function" ? storage.close() : null),
        Promise.resolve(outbox.close())
      ])
        .catch((error) => {
          logger.error?.("repository.close_failed", { code: error?.code ?? "repository_close_failed" });
        })
        .finally(() => {
          logger.info("server.closed");
          if (onDrained) onDrained();
        });
    });
  };
  server.checkReadiness = checkReadiness;
  server.closeRepository = async () => {
    await Promise.all([
      typeof repository.close === "function" ? repository.close() : null,
      typeof storage.close === "function" ? storage.close() : null,
      outbox.close()
    ]);
  };
  server.isShuttingDown = () => shuttingDown;
  server.inFlight = () => inFlight;

  return server;
}

export async function listenWhenReady(server, { port, host } = {}) {
  await server.checkReadiness();
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    if (host) server.listen(port, host, onListening);
    else server.listen(port, onListening);
  });
  return server;
}

if (process.argv[1] && process.argv[1].endsWith("/server.js")) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createServer();
  try {
    await listenWhenReady(server, { port, host: process.env.HOST });
    rootLogger.info("server.listening", { port });
  } catch (error) {
    rootLogger.error("server.startup_failed", { code: error?.code ?? "postgres_not_ready" });
    await server.closeRepository();
    process.exitCode = 1;
  }

  const shutdown = () => {
    server.beginShutdown({ onDrained: () => process.exit(0) });
    // Failsafe: force exit if draining stalls.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
