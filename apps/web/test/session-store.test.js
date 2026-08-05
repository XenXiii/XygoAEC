import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresSessionStore } from "../src/session-store.js";

function fakePool() {
  const records = new Map();
  return { records, async query(sql, params = []) {
    if (sql.includes("INSERT INTO web_auth_sessions")) {
      records.set(params[0], { encrypted_payload: params[2], encryption_iv: params[3], encryption_tag: params[4], idle_expires_at: params[5], absolute_expires_at: params[6] });
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("DELETE FROM web_auth_sessions WHERE session_key=$1") && sql.includes("idle_expires_at")) {
      const row = records.get(params[0]);
      const expired = row && (row.idle_expires_at <= new Date() || row.absolute_expires_at <= new Date());
      if (expired) records.delete(params[0]);
      return { rowCount: expired ? 1 : 0, rows: [] };
    }
    if (sql.includes("SELECT encrypted_payload")) return { rows: records.has(params[0]) ? [records.get(params[0])] : [] };
    if (sql === "DELETE FROM web_auth_sessions WHERE session_key=$1") return { rowCount: records.delete(params[0]) ? 1 : 0, rows: [] };
    if (sql.startsWith("DELETE FROM web_auth_sessions WHERE idle_expires_at")) {
      let count = 0;
      for (const [id, row] of records) if (row.idle_expires_at <= new Date() || row.absolute_expires_at <= new Date()) { records.delete(id); count += 1; }
      return { rowCount: count, rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
}

const secrets = {
  encryptionSecret: "independent-encryption-secret-at-least-32-characters",
  lookupSecret: "independent-lookup-secret-at-least-32-characters"
};

test("PostgreSQL session records are encrypted, restart-readable, and invalidated", async () => {
  const pool = fakePool();
  const first = createPostgresSessionStore({ pool, ...secrets });
  const record = { kind: "user_session", accessToken: "access-sensitive", refreshToken: "refresh-sensitive", idleExpiresAt: Date.now() + 60_000, absoluteExpiresAt: Date.now() + 120_000 };
  await first.set("opaque-browser-handle", record);
  const [[databaseKey, databaseRow]] = pool.records;
  assert.notEqual(databaseKey, "opaque-browser-handle");
  assert.equal(databaseRow.encrypted_payload.toString().includes("refresh-sensitive"), false);
  assert.equal(databaseRow.encrypted_payload.toString().includes("access-sensitive"), false);
  const restarted = createPostgresSessionStore({ pool, ...secrets });
  assert.deepEqual(await restarted.get("opaque-browser-handle"), record);
  await restarted.delete("opaque-browser-handle");
  assert.equal(await first.get("opaque-browser-handle"), null);
});

test("PostgreSQL cleanup removes expired sessions", async () => {
  const pool = fakePool();
  const store = createPostgresSessionStore({ pool, ...secrets });
  await store.set("expired", { kind: "user_session", accessToken: "a", refreshToken: "r", idleExpiresAt: Date.now() - 1, absoluteExpiresAt: Date.now() + 60_000 });
  assert.equal(await store.cleanup(), 1);
  assert.equal(await store.get("expired"), null);
});
