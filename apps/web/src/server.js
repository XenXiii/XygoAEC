import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const appRoot = path.resolve(process.cwd(), "apps/web");
const publicDir = path.join(appRoot, "public");
const srcDir = path.join(appRoot, "src");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function resolveFile(urlPath) {
  if (urlPath === "/" || urlPath === "") {
    return path.join(publicDir, "index.html");
  }

  if (urlPath.startsWith("/src/")) {
    return path.join(srcDir, urlPath.replace(/^\/src\//, ""));
  }

  return path.join(publicDir, urlPath.replace(/^\/+/, ""));
}

export function createWebServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const filePath = resolveFile(url.pathname);

    if (!(filePath.startsWith(publicDir) || filePath.startsWith(srcDir)) || !fs.existsSync(filePath)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] ?? "application/octet-stream"
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
