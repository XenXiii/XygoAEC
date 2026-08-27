import fs from "node:fs"; import path from "node:path"; import test from "node:test"; import assert from "node:assert/strict";
test("deployable web server and public tree contain no OpenClaw dashboard exposure", () => {
  const server = fs.readFileSync(path.resolve(process.cwd(), "apps/web/src/server.js"), "utf8");
  assert.doesNotMatch(server, /openclaw-dashboard|recentWorkspaceFiles|medicalDashboard/);
  assert.equal(fs.existsSync(path.resolve(process.cwd(), "apps/web/public/openclaw-dashboard.html")), false);
});
