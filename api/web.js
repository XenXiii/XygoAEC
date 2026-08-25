import { createWebServer } from "../apps/web/src/server.js";
import { withVercelNeonAliases } from "../config/vercel-neon-env.js";

const server = createWebServer({ env: withVercelNeonAliases(process.env) });

export default function handler(req, res) {
  server.emit("request", req, res);
}
