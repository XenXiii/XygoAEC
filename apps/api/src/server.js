import http from "node:http";

import { handleApiRequest } from "./handlers.js";
import { createRepositoryFromEnv } from "./repositories/index.js";
import { buildTenantEventSnapshot, formatSseEvent } from "./realtime.js";
import { assertAuthConfig, loadAuthConfig } from "./auth/config.js";
import { createRemoteJwks } from "./auth/jwks.js";
import { resolvePrincipal } from "./auth/principal.js";
import { AuthError } from "./auth/jwt.js";
import { baseResponseHeaders, CORS_HEADERS } from "./http/headers.js";
import { createRateLimiter } from "./http/rate-limit.js";
import { assertStagedMode } from "../../../packages/staged-mode/src/index.js";

function sendJson(res, status, body, extraHeaders = {}) {
  if (res.headersSent) {
    return;
  }
  res.writeHead(status, baseResponseHeaders({ "content-type": "application/json", ...extraHeaders }));
  res.end(JSON.stringify(body));
}

function authErrorResponse(res, error) {
  sendJson(res, 401, { error: "unauthorized", message: error.message, code: error.code, staged: true });
}

function rateLimitKey(req) {
  return (
    req.headers["x-staged-tenant-id"] ??
    req.headers.authorization ??
    req.socket?.remoteAddress ??
    "anonymous"
  );
}

export function createServer({ env = process.env } = {}) {
  const authConfig = loadAuthConfig(env);
  assertAuthConfig(authConfig);
  if (authConfig.mode === "staged") {
    assertStagedMode({ STAGED_MODE: authConfig.stagedModeEnabled });
  }

  const jwks = authConfig.mode === "oidc" ? createRemoteJwks({ jwksUri: authConfig.oidc.jwksUri }) : null;
  const repository = createRepositoryFromEnv(env);

  const maxBodyBytes = Number(env.XYGO_MAX_BODY_BYTES ?? 1_048_576); // 1 MiB
  const requestTimeoutMs = Number(env.XYGO_REQUEST_TIMEOUT_MS ?? 15_000);
  const rateLimiter = createRateLimiter({
    windowMs: Number(env.XYGO_RATE_LIMIT_WINDOW_MS ?? 60_000),
    max: Number(env.XYGO_RATE_LIMIT_MAX ?? 300)
  });

  return http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    // Rate limit every request up front (429 with Retry-After when exceeded).
    const decision = rateLimiter.check(rateLimitKey(req));
    if (!decision.allowed) {
      sendJson(
        res,
        429,
        { error: "rate_limited", message: "Too many requests.", staged: true },
        {
          "retry-after": String(decision.retryAfterSec),
          "x-ratelimit-limit": String(decision.limit),
          "x-ratelimit-remaining": String(decision.remaining)
        }
      );
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

    const isStream =
      req.method === "GET" &&
      parts[0] === "v1" &&
      parts[1] === "tenants" &&
      parts[2] &&
      parts[3] === "events" &&
      parts[4] === "stream";

    if (isStream) {
      const tenantId = parts[2];
      resolvePrincipal({ headers: req.headers, searchParams: url.searchParams, config: authConfig, jwks })
        .then((principal) => {
          if (!principal?.tenantId || principal.tenantId !== tenantId) {
            sendJson(res, 403, { error: "forbidden", message: "Tenant access denied.", staged: true });
            return;
          }

          res.writeHead(
            200,
            baseResponseHeaders({
              "content-type": "text/event-stream",
              "cache-control": "no-cache",
              connection: "keep-alive"
            })
          );
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

    // Bound request processing time for non-stream requests.
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
      if (received > maxBodyBytes) {
        aborted = true;
        clearTimeout(timeout);
        sendJson(res, 413, { error: "payload_too_large", message: "Request body exceeds limit.", staged: true });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (aborted) {
        return;
      }
      clearTimeout(timeout);
      const body = chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : null;

      resolvePrincipalForRequest({ req, url, authConfig, jwks })
        .then((principal) => {
          const result = handleApiRequest({
            method: req.method,
            path: req.url ?? "/",
            headers: req.headers,
            body,
            repository,
            principal,
            authConfig
          });
          sendJson(res, result.status, result.body, result.headers);
        })
        .catch((error) => {
          if (error instanceof AuthError) {
            authErrorResponse(res, error);
          } else {
            sendJson(res, 500, {
              error: "internal_error",
              message: "Staged runtime failed to process the request.",
              staged: true
            });
          }
        });
    });

    req.on("error", () => {
      clearTimeout(timeout);
    });
  });
}

async function resolvePrincipalForRequest({ req, url, authConfig, jwks }) {
  if ((req.url ?? "/") === "/health") {
    return null;
  }
  return resolvePrincipal({ headers: req.headers, searchParams: url.searchParams, config: authConfig, jwks });
}

if (process.argv[1] && process.argv[1].endsWith("/server.js")) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => {
    process.stdout.write(`Xygo staged API listening on http://127.0.0.1:${port}\n`);
  });
}
