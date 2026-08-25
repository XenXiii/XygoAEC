import { createServer } from "../apps/api/src/server.js";
import { withVercelNeonAliases } from "../config/vercel-neon-env.js";

const server = createServer({ env: withVercelNeonAliases(process.env) });

export default function handler(req, res) {
  server.emit("request", req, res);
}
