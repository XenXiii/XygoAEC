#!/usr/bin/env node
import { checkPostgresReadiness } from "../apps/api/src/repositories/postgres-migrations.js";
import { postgresPoolOptionsFromEnvironment } from "../packages/production-config/src/index.js";

const connectionString = process.env.XYGO_API_PG_URL;
if (!connectionString) {
  throw new Error("XYGO_API_PG_URL is required to check Postgres readiness.");
}

const pg = (await import("pg")).default;
const pool = new pg.Pool({
  connectionString,
  ...postgresPoolOptionsFromEnvironment(process.env),
  max: 1,
  application_name: "xygo-readiness-check"
});
try {
  const result = await checkPostgresReadiness(pool);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await pool.end();
}
