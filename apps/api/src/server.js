import http from "node:http";

import { handleApiRequest } from "./handlers.js";
import { createRepositoryFromEnv } from "./repositories/index.js";
import { buildTenantEventSnapshot, canStreamTenantEvents, formatSseEvent } from "./realtime.js";

export function createServer() {
  const repository = createRepositoryFromEnv();

  return http.createServer((req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "content-type,x-staged-tenant-id,x-staged-user-id",
        "access-control-allow-methods": "GET,POST,OPTIONS"
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

    if (req.method === "GET" && parts[0] === "v1" && parts[1] === "tenants" && parts[2] && parts[3] === "events" && parts[4] === "stream") {
      const tenantId = parts[2];

      if (!canStreamTenantEvents({ headers: req.headers, tenantId, searchParams: url.searchParams })) {
        res.writeHead(403, {
          "content-type": "application/json",
          "x-xygo-staged-mode": "true",
          "access-control-allow-origin": "*"
        });
        res.end(JSON.stringify({
          error: "forbidden",
          message: "Tenant access denied.",
          staged: true
        }));
        return;
      }

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-xygo-staged-mode": "true",
        "access-control-allow-origin": "*"
      });

      res.write(formatSseEvent({
        event: "snapshot",
        data: buildTenantEventSnapshot({ tenantId, repository })
      }));

      const timer = setInterval(() => {
        res.write(formatSseEvent({
          event: "heartbeat",
          data: buildTenantEventSnapshot({ tenantId, repository })
        }));
      }, 5000);

      req.on("close", () => {
        clearInterval(timer);
      });

      return;
    }

    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const result = handleApiRequest({
          method: req.method,
          path: req.url ?? "/",
          headers: req.headers,
          body: chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : null,
          repository
        });

        res.writeHead(result.status, result.headers);
        res.end(JSON.stringify(result.body));
      } catch {
        res.writeHead(500, {
          "content-type": "application/json",
          "x-xygo-staged-mode": "true",
          "access-control-allow-origin": "*"
        });
        res.end(JSON.stringify({
          error: "internal_error",
          message: "Staged runtime failed to process the request.",
          staged: true
        }));
      }
    });
  });
}

if (process.argv[1] && process.argv[1].endsWith("/server.js")) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => {
    process.stdout.write(`Xygo staged API listening on http://127.0.0.1:${port}\n`);
  });
}
