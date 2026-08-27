import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresBillingRepository } from "../src/billing/postgres.js";

test("postgres billing repository keeps every lookup workspace or event scoped", async () => {
  const calls = [];
  const pool = { async query(sql, args) { calls.push({ sql, args }); return { rows: [] }; } };
  const repository = createPostgresBillingRepository({ pool });
  await repository.getSubscription("w1");
  await repository.hasEvent("evt_1");
  await repository.listEvents("w1");
  assert.match(calls[0].sql, /workspace_id=\$1/);
  assert.deepEqual(calls[0].args, ["w1"]);
  assert.match(calls[1].sql, /provider_event_id=\$1/);
  assert.deepEqual(calls[2].args, ["w1"]);
});

test("postgres billing repository rejects incomplete subscription metadata", async () => {
  const repository = createPostgresBillingRepository({ pool: { async query() { return { rows: [] }; } } });
  await assert.rejects(repository.saveSubscription({ workspaceId: "w1", status: "active" }), /metadata is incomplete/);
});
