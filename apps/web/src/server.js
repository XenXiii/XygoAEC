import fs from "node:fs";
import http from "node:http";
import path from "node:path";

import { assertWebRuntimeConfig, loadWebRuntimeConfig, publicWebRuntimeConfig } from "./runtime-config.js";
import { createWebAuthSessionManager } from "./auth-session.js";
import { assertProductionWebEnvironment } from "../../../packages/production-config/src/index.js";

const appRoot = path.resolve(process.cwd(), "apps/web");
const publicDir = path.join(appRoot, "public");
const srcDir = path.join(appRoot, "src");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function resolveFile(urlPath) {
  if (urlPath === "/" || urlPath === "") {
    return path.join(publicDir, "index.html");
  }

  if (urlPath.startsWith("/src/")) {
    return path.join(srcDir, urlPath.replace(/^\/src\//, ""));
  }

  const publicPath = path.join(publicDir, urlPath.replace(/^\/+/, ""));

  if (!path.extname(publicPath)) {
    const htmlPath = `${publicPath}.html`;

    if (fs.existsSync(htmlPath)) {
      return htmlPath;
    }
  }

  return publicPath;
}

export function createWebServer({ env = process.env, fetchImpl = fetch, sessionStore } = {}) {
  assertProductionWebEnvironment(env);
  const runtimeConfig = assertWebRuntimeConfig(loadWebRuntimeConfig(env), env);
  const auth = runtimeConfig.auth.mode === "oidc"
    ? createWebAuthSessionManager(runtimeConfig, { fetchImpl, sessionStore })
    : null;

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const respond = (result) => {
      res.writeHead(result.status, {
        ...(result.body ? { "content-type": mimeTypes[".json"] } : {}),
        ...(result.headers ?? {})
      });
      res.end(result.body ? JSON.stringify(result.body) : undefined);
    };
    if (auth && req.method === "GET" && url.pathname === "/auth/login") {
      respond(await auth.beginLogin(url.searchParams.get("returnTo") ?? undefined));
      return;
    }
    if (auth && req.method === "GET" && url.pathname === "/auth/callback") {
      try {
        respond(await auth.completeCallback(url, req.headers));
      } catch (error) {
        respond({ status: 502, body: { code: "oidc_callback_failed", message: error.message }, headers: { "cache-control": "no-store" } });
      }
      return;
    }
    if (auth && req.method === "GET" && url.pathname === "/auth/session") {
      respond({ ...await auth.session(req.headers), headers: { "cache-control": "no-store" } });
      return;
    }
    if (auth && req.method === "POST" && url.pathname === "/auth/session/renew") {
      if (!auth.checkOrigin(req.headers)) return respond({ status: 403, body: { code: "invalid_origin" } });
      try {
        respond({ ...await auth.renew(req.headers), headers: { "cache-control": "no-store" } });
      } catch (error) {
        respond({ status: 502, body: { code: "oidc_renewal_failed", message: error.message }, headers: { "cache-control": "no-store" } });
      }
      return;
    }
    if (auth && req.method === "POST" && url.pathname === "/auth/logout") {
      if (!auth.checkOrigin(req.headers)) return respond({ status: 403, body: { code: "invalid_origin" } });
      respond(await auth.logout(req.headers));
      return;
    }
    if (auth && req.method === "GET" && url.pathname === "/auth/events/stream") {
      const tenantId = url.searchParams.get("tenantId");
      if (!tenantId || !/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) return respond({ status: 400, body: { code: "invalid_tenant_id" } });
      const token = await auth.accessToken(req.headers);
      if (!token) return respond({ status: 401, body: { code: "authentication_required" }, headers: { "cache-control": "no-store" } });
      const upstreamUrl = `${runtimeConfig.apiBaseUrl.replace(/\/$/, "")}/v1/tenants/${encodeURIComponent(tenantId)}/events/stream`;
      const controller = new AbortController();
      req.once?.("close", () => controller.abort());
      try {
        const upstream = await fetchImpl(upstreamUrl, { headers: { accept: "text/event-stream", authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!upstream.ok || !upstream.body) return respond({ status: upstream.status, body: { code: "event_stream_unavailable" }, headers: { "cache-control": "no-store" } });
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
        for await (const chunk of upstream.body) res.write(chunk);
        res.end();
      } catch {
        if (!res.headersSent) respond({ status: 502, body: { code: "event_stream_unavailable" }, headers: { "cache-control": "no-store" } });
        else res.end();
      }
      return;
    }
    if (req.method === "GET" && url.pathname === "/runtime-config.json") {
      res.writeHead(200, {
        "content-type": mimeTypes[".json"],
        "cache-control": "no-store"
      });
      res.end(JSON.stringify(publicWebRuntimeConfig(runtimeConfig)));
      return;
    }
    const filePath = resolveFile(url.pathname);

    if (!(filePath.startsWith(publicDir) || filePath.startsWith(srcDir)) || !fs.existsSync(filePath)) {
      const notFoundPath = path.join(publicDir, "404.html");
      res.writeHead(404, { "content-type": mimeTypes[".html"] });
      res.end(fs.readFileSync(notFoundPath));
      return;
    }

    const ext = path.extname(filePath);
    const noStore = url.pathname.startsWith("/auth/") || url.pathname === "/runtime-config.json";
    const revalidate = ext === ".html" || ext === ".js" || ext === ".css" || ext === ".webmanifest";
    res.writeHead(200, {
      "content-type": mimeTypes[ext] ?? "application/octet-stream",
      "cache-control": noStore ? "no-store" : revalidate ? "no-cache" : "public, max-age=86400"
    });
    res.end(fs.readFileSync(filePath));
  });
}

if (process.argv[1] && process.argv[1].endsWith("/server.js")) {
  const port = Number(process.env.WEB_PORT ?? 4173);
  createWebServer().listen(port, () => {
    process.stdout.write(`Xygo staged web listening on http://127.0.0.1:${port}\n`);
  });
}
