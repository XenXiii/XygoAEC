#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { provisionStagedTenant } from "../packages/activation/src/provision-tenant.js";

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1];
}

if (!process.argv.includes("--approve-staged")) {
  throw new Error("Refusing to provision without --approve-staged. This command never provisions production.");
}

const configPath = valueAfter("--config");
if (!configPath) throw new Error("Usage: npm run provision:tenant -- --config <json> --approve-staged [--store <json>]");

const storePath = path.resolve(valueAfter("--store") ?? "infrastructure/staged-data/tenant-provisioning.json");
const input = JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8"));
const result = provisionStagedTenant({ storePath, input });

process.stdout.write(`${JSON.stringify({
  created: result.created,
  tenantId: result.tenant.id,
  projectId: result.project.id,
  blueprintId: result.blueprint.id,
  storePath
}, null, 2)}\n`);
