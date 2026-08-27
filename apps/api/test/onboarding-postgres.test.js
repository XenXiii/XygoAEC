import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresOnboardingRepository } from "../src/onboarding/postgres.js";

const codec = {
  encryptJson: (value) => Buffer.from(JSON.stringify(value)),
  decryptJson: (value) => JSON.parse(value.toString())
};

test("postgres onboarding repository requires an encryption codec", () => {
  assert.throws(() => createPostgresOnboardingRepository({ pool: { query() {} } }), /encryption codec/);
});

test("save upserts by id with lifecycle columns and encrypted payload", async () => {
  const calls = [];
  const repo = createPostgresOnboardingRepository({ pool: { async query(sql, args) { calls.push({ sql, args }); return { rows: [] }; } }, ...codec });
  const journey = { id: "j1", workspaceId: "w-a", ownerUserId: "owner-a", state: "profile_pending", appliedEvents: ["e1"], objective: "grow", createdAt: "t0", updatedAt: "t1" };
  await repo.save(journey);
  assert.match(calls[0].sql, /INSERT INTO onboarding_journeys/);
  assert.match(calls[0].sql, /ON CONFLICT\(id\) DO UPDATE/);
  assert.equal(calls[0].args[0], "j1");
  assert.equal(calls[0].args[3], "profile_pending");
  assert.deepEqual(calls[0].args[4], ["e1"]);
  // The persisted ciphertext round-trips back to the full journey.
  assert.deepEqual(JSON.parse(calls[0].args[5].toString()), journey);
});

test("get selects by id and decrypts the stored journey", async () => {
  const stored = { id: "j1", state: "audit_queued", objective: "grow" };
  const repo = createPostgresOnboardingRepository({
    pool: { async query() { return { rows: [{ payload_ciphertext: codec.encryptJson(stored) }] }; } },
    ...codec
  });
  assert.deepEqual(await repo.get("j1"), stored);
});

test("get returns null when the journey is absent", async () => {
  const repo = createPostgresOnboardingRepository({ pool: { async query() { return { rows: [] }; } }, ...codec });
  assert.equal(await repo.get("missing"), null);
});
