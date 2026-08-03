#!/usr/bin/env node
import { applyPostgresMigrations } from "../apps/api/src/repositories/postgres-migrations.js";

const connectionString = process.env.XYGO_API_PG_URL;
if (!connectionString) {
  throw new Error("XYGO_API_PG_URL is required to apply Postgres migrations.");
}

const pg = (await import("pg")).default;
const pool = new pg.Pool({ connectionString });
try {
  const versions = await applyPostgresMigrations(pool);
  process.stdout.write(`Applied Postgres migrations: ${versions.join(", ")}\n`);
} finally {
  await pool.end();
}
