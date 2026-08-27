import test from "node:test";
import assert from "node:assert/strict";

import { createRuntimeRepositories } from "../src/runtime-repositories.js";

test("non-production local runtime uses explicit non-persistent repositories", () => {
  const result = createRuntimeRepositories({ env: { NODE_ENV: "test", XYGO_API_REPOSITORY_MODE: "sqlite" }, coreRepository: {} });
  assert.equal(result.persistent, false);
  assert.equal(typeof result.auditRepository.getMembership, "function");
  assert.equal(typeof result.billingRepository.getSubscription, "function");
});

test("production refuses an in-memory authenticated repository fallback", () => {
  assert.throws(
    () => createRuntimeRepositories({ env: { NODE_ENV: "production", XYGO_API_REPOSITORY_MODE: "sqlite" }, coreRepository: {} }),
    /Production requires/
  );
});

test("postgres runtime requires encryption and lookup secrets", () => {
  const coreRepository = { rawQuery: async () => ({ rows: [] }) };
  assert.throws(
    () => createRuntimeRepositories({ env: { NODE_ENV: "production", XYGO_API_REPOSITORY_MODE: "postgres" }, coreRepository }),
    /XYGO_DATA_ENCRYPTION_SECRET/
  );
});

test("postgres runtime wires durable audit and billing repositories", async () => {
  const calls = [];
  const coreRepository = { rawQuery: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  const result = createRuntimeRepositories({
    env: {
      NODE_ENV: "production",
      XYGO_API_REPOSITORY_MODE: "postgres",
      XYGO_DATA_ENCRYPTION_SECRET: "e".repeat(32),
      XYGO_DATA_LOOKUP_SECRET: "l".repeat(32)
    },
    coreRepository
  });
  assert.equal(result.persistent, true);
  await result.auditRepository.getConversation("workspace-a", "conversation-a");
  await result.billingRepository.getSubscription("workspace-a");
  assert.match(calls[0].sql, /workspace_id=\$1/);
  assert.match(calls[1].sql, /client_subscriptions/);
});
