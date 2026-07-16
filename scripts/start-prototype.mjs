// One-command staged prototype launcher: runs the API, web, and worker together
// and shuts them all down on Ctrl-C. Dependency-free (Node child_process).
import { spawn } from "node:child_process";

const API_PORT = process.env.PORT ?? "3000";
const WEB_PORT = process.env.WEB_PORT ?? "4173";

const services = [
  { name: "api", args: ["apps/api/src/server.js"] },
  { name: "web", args: ["apps/web/src/server.js"] },
  { name: "worker", args: ["apps/worker/src/worker.js"] }
];

const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 500).unref();
}

for (const service of services) {
  const child = spawn(process.execPath, service.args, { stdio: "inherit", env: process.env });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      process.stdout.write(`\n[${service.name}] exited (code ${code}); stopping prototype.\n`);
      shutdown(code ?? 0);
    }
  });
  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

process.stdout.write(
  [
    "",
    "  Xygo AEC — staged prototype running (SIMULATED DATA, not production)",
    `  Web dashboard : http://127.0.0.1:${WEB_PORT}`,
    `  API           : http://127.0.0.1:${API_PORT}  (health: /health, ready: /ready, metrics: /metrics)`,
    "  Tenants       : tenant-commercial-sim, tenant-residential-sim",
    "  Stop          : Ctrl-C",
    ""
  ].join("\n") + "\n"
);
