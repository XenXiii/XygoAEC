import { createWebServer } from "../apps/web/src/server.js";

const server = createWebServer();

export default function handler(req, res) {
  server.emit("request", req, res);
}
