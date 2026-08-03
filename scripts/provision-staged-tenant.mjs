#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { createPostgresRepository } from "../apps/api/src/repositories/postgres.js";

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1];
}

if (!process.argv.includes("--approve-staged")) {
  throw new Error("Refusing to provision without --approve-staged. This command never provisions production.");
}

const configPath = valueAfter("--config");
if (!configPath) throw new Error("Usage: npm run provision:tenant -- --config <json> --approve-staged");
if (!process.env.XYGO_API_PG_URL) {
  throw new Error("XYGO_API_PG_URL is required. Provisioning only writes to the canonical Postgres repository.");
}

const input = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
const repository = createPostgresRepository({
  connectionString: process.env.XYGO_API_PG_URL,
  auditSigningKey: process.env.XYGO_AUDIT_SIGNING_KEY ?? null
});

try {
  const result = await repository.provisionStagedTenant(input);
  process.stdout.write(`${JSON.stringify({
    created: result.created,
    tenantId: result.tenant.id,
    projectId: result.project.id,
    blueprintId: result.blueprint.id
  }, null, 2)}\n`);
} finally {
  await repository.close();
}
