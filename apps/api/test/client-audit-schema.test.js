import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const migration = fs.readFileSync(
  path.resolve(process.cwd(), "infrastructure/migrations/postgres/0002_client_audit_platform.sql"),
  "utf8"
);

test("client audit schema covers the approved conversion flow", () => {
  for (const table of [
    "client_users",
    "client_identities",
    "client_workspaces",
    "client_workspace_members",
    "business_connections",
    "audit_engagements",
    "audit_intake_responses",
    "audit_results",
    "client_subscriptions",
    "subscription_events",
    "client_consents",
    "client_data_requests"
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
});

test("direct personal fields use ciphertext and lookup hashes", () => {
  assert.match(migration, /email_lookup_hash CHAR\(64\) NOT NULL UNIQUE/);
  assert.match(migration, /email_ciphertext BYTEA NOT NULL/);
  assert.match(migration, /phone_ciphertext BYTEA/);
  assert.match(migration, /name_ciphertext BYTEA NOT NULL/);
  assert.match(migration, /address_ciphertext BYTEA/);
  assert.doesNotMatch(migration, /email\s+TEXT/i);
  assert.doesNotMatch(migration, /phone\s+TEXT/i);
});

test("audit results support one free solution and paid full access", () => {
  assert.match(migration, /'free_solution'/);
  assert.match(migration, /access_level IN \('free', 'paid', 'enterprise'\)/);
  assert.match(migration, /free_solution_unlocked_at/);
  assert.match(migration, /full_results_unlocked_at/);
});

