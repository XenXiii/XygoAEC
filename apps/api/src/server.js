import http from "node:http";

import { handleApiRequest } from "./handlers.js";
import { createRepositoryFromEnv } from "./repositories/index.js";
import { buildTenantEventSnapshot, formatSseEvent } from "./realtime.js";
import { assertAuthConfig, loadAuthConfig } from "./auth/config.js";
import { createRemoteJwks } from "./auth/jwks.js";
import { resolvePrincipal } from "./auth/principal.js";
import { AuthError } from "./auth/jwt.js";
import { assertStagedMode } from "../../../packages/staged-mode/src/index.js";

const BASE_HEADERS = {
  "x-xygo-staged-mode": "true",
  "access-control-allow-origin": "*"
};

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "content-type": "application/json", ...BASE_HEADERS, ...extraHeaders });
  res.end(JSON.stringify(body));
}

function authErrorResponse(res, error) {
  const status = error.code === "missing_token" || error.code === "token_expired" ? 401 : 401;
  sendJson(res, status, {
    error: "unauthorized",
    message: error.message,
    code: error.code,
    staged: true
  });
}

export function createServer({ env = process.env } = {}) {
  const authConfig = loadAuthConfig(env);
  // B3: enforce the trust posture at startup instead of trusting a static header.
  assertAuthConfig(authConfig);
  // Wire the staged-mode package into the runtime (not just tests): a staged
  // deployment must actually be in staged mode.
  if (authConfig.mode === "staged") {
    assertStagedMode({ STAGED_MODE: authConfig.stagedModeEnabled });
  }

  const jwks = authConfig.mode === "oidc" ? createRemoteJwks({ jwksUri: authConfig.oidc.jwksUri }) : null;
  const repository = createRepositoryFromEnv(env);

  return http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,content-type,x-staged-tenant-id,x-staged-user-id",
        "access-control-allow-methods": "GET,POST,OPTIONS"
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

    // SSE stream — authenticate before opening the stream.
    if (
      req.method === "GET" &&
      parts[0] === "v1" &&
      parts[1] === "tenants" &&
      parts[2] &&
      parts[3] === "events" &&
      parts[4] === "stream"
    ) {
      const tenantId = parts[2];

      resolvePrincipal({ headers: req.headers, searchParams: url.searchParams, config: authConfig, jwks })
        .then((principal) => {
          if (!principal?.tenantId || principal.tenantId !== tenantId) {
            sendJson(res, 403, { error: "forbidden", message: "Tenant access denied.", staged: true });
            return;
          }

          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
            ...BASE_HEADERS
          });

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

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));

    req.on("end", () => {
      const body = chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : null;

      // /health stays public and cheap — no principal resolution.
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

          res.writeHead(result.status, result.headers);
          res.end(JSON.stringify(result.body));
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
  });
}

// Resolve the principal for a normal request. Public routes (/health) and
// non-tenant paths skip resolution so they never require credentials.
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
