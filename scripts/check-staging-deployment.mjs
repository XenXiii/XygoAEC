import fs from "node:fs";
import { POSTGRES_MIGRATIONS } from "../apps/api/src/repositories/postgres-migrations.js";
import { assertStagingDeploymentReadiness } from "../packages/staging-readiness/src/index.js";

const vercelConfig = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const serviceWorkerSource = fs.readFileSync(new URL("../apps/web/public/service-worker.js", import.meta.url), "utf8");

const result = assertStagingDeploymentReadiness({
  env: process.env,
  vercelConfig,
  serviceWorkerSource,
  migrationVersions: POSTGRES_MIGRATIONS.map(({ version }) => version)
});

process.stdout.write(`${JSON.stringify({ ready: true, ...result }, null, 2)}\n`);
