import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { assertPostgresMigrationsCurrent } from "../repositories/postgres-migrations.js";
import { postgresPoolOptionsFromEnvironment } from "../../../../packages/production-config/src/index.js";

const DEFAULT_SQLITE_PATH = path.resolve(process.cwd(), "infrastructure/staged-data/outbox.sqlite");
const JOB_STATUSES = new Set(["pending", "processing", "failed", "processed", "dead"]);

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS outbox_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  locked_at TEXT,
  locked_by TEXT,
  last_error TEXT,
  replay_count INTEGER NOT NULL DEFAULT 0,
  last_replayed_at TEXT,
  last_replay_reason TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_jobs_ready ON outbox_jobs(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_jobs_tenant ON outbox_jobs(tenant_id, status, created_at);
`;

function nowDate(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Outbox time is invalid.");
  return date;
}

function nowIso(value = Date.now()) {
  return nowDate(value).toISOString();
}

function epoch(value) {
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function boundedError(error) {
  return String(error?.message ?? error ?? "Unknown worker error").slice(0, 4000);
}

function normalizedReplayReason(value) {
  const reason = requiredString(value, "Replay reason");
  if (reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason)) {
    throw new Error("Replay reason must be at most 500 printable characters.");
  }
  return reason;
}

function defaultIdempotencyKey(event) {
  return [event.eventType, event.eventVersion ?? 1, event.aggregateType, event.aggregateId].join(":");
}

function sameLogicalEvent(existing, candidate) {
  return existing?.tenantId === (candidate.tenantId ?? null) &&
    existing?.event?.eventType === candidate.eventType &&
    (existing?.event?.eventVersion ?? 1) === (candidate.eventVersion ?? 1) &&
    existing?.event?.aggregateType === candidate.aggregateType &&
    existing?.event?.aggregateId === candidate.aggregateId;
}

function idempotencyConflict() {
  const error = new Error("Outbox idempotency key is already bound to a different logical event.");
  error.code = "outbox_idempotency_conflict";
  return error;
}

function newJob(event, { idempotencyKey, now = Date.now() } = {}) {
  const id = requiredString(event?.id, "Outbox event id");
  requiredString(event?.eventType, "Outbox event type");
  requiredString(event?.aggregateType, "Outbox aggregate type");
  requiredString(event?.aggregateId, "Outbox aggregate id");
  const timestamp = nowIso(now);
  return {
    id,
    tenantId: event.tenantId ?? null,
    event,
    idempotencyKey: requiredString(idempotencyKey ?? defaultIdempotencyKey(event), "Outbox idempotency key"),
    status: "pending",
    attempts: 0,
    nextAttemptAt: timestamp,
    lockedAt: null,
    lockedBy: null,
    lastError: null,
    replayCount: 0,
    lastReplayedAt: null,
    lastReplayReason: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null
  };
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function backoffMs(attempts, baseBackoffMs, maxBackoffMs) {
  return Math.min(maxBackoffMs, baseBackoffMs * 2 ** Math.max(0, attempts - 1));
}

function assertJobStatus(status) {
  if (!JOB_STATUSES.has(status)) throw new Error(`Unknown outbox job status: ${status}`);
}

function healthFromRecords(records, { now = Date.now(), staleAfterMs = 60_000, maxDeadJobs = 0 } = {}) {
  const staleBefore = epoch(now) - staleAfterMs;
  const counts = Object.fromEntries([...JOB_STATUSES].map((status) => [status, 0]));
  let stale = 0;
  for (const record of records) {
    assertJobStatus(record.status);
    counts[record.status] += 1;
    if (record.status === "processing" && record.lockedAt && epoch(record.lockedAt) <= staleBefore) stale += 1;
  }
  return {
    ready: stale === 0 && counts.dead <= maxDeadJobs,
    counts,
    stale,
    backlog: counts.pending + counts.failed + counts.processing
  };
}

function healthError(health) {
  const error = new Error(`Outbox is unhealthy: ${health.stale} stale processing job(s), ${health.counts.dead} dead job(s).`);
  error.code = "outbox_unhealthy";
  error.health = health;
  return error;
}

export function createOutboxStore() {
  const items = new Map();
  const idempotencyKeys = new Map();

  const store = {
    backend: "memory",
    enqueue(event, options = {}) {
      const candidate = newJob(event, options);
      const existingId = idempotencyKeys.get(candidate.idempotencyKey);
      if (existingId) {
        const existing = items.get(existingId);
        if (!sameLogicalEvent(existing, event)) throw idempotencyConflict();
        return clone(existing);
      }
      if (items.has(candidate.id)) throw new Error("Outbox event id already exists with a different idempotency key.");
      items.set(candidate.id, candidate);
      idempotencyKeys.set(candidate.idempotencyKey, candidate.id);
      return clone(candidate);
    },
    ready(now = Date.now(), staleAfterMs = 60_000) {
      const current = epoch(now);
      const staleBefore = current - staleAfterMs;
      return [...items.values()].filter((record) =>
        ((record.status === "pending" || record.status === "failed") && epoch(record.nextAttemptAt) <= current) ||
        (record.status === "processing" && record.lockedAt && epoch(record.lockedAt) <= staleBefore)
      );
    },
    async claim({ workerId, now = Date.now(), limit = 1, staleAfterMs = 60_000 }) {
      const claimedAt = nowIso(now);
      return store.ready(now, staleAfterMs).slice(0, limit).map((record) => {
        Object.assign(record, {
          status: "processing",
          attempts: record.attempts + 1,
          lockedAt: claimedAt,
          lockedBy: workerId,
          updatedAt: claimedAt
        });
        return clone(record);
      });
    },
    async complete({ id, workerId, now = Date.now() }) {
      const record = items.get(id);
      if (!record || record.status !== "processing" || record.lockedBy !== workerId) {
        throw new Error("Outbox job is not claimed by this worker.");
      }
      const completedAt = nowIso(now);
      Object.assign(record, {
        status: "processed",
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        updatedAt: completedAt,
        completedAt
      });
      return clone(record);
    },
    async fail({ id, workerId, error, now = Date.now(), maxAttempts = 5, baseBackoffMs = 1000, maxBackoffMs = 900_000 }) {
      const record = items.get(id);
      if (!record || record.status !== "processing" || record.lockedBy !== workerId) {
        throw new Error("Outbox job is not claimed by this worker.");
      }
      const failedAt = nowDate(now);
      const dead = record.attempts >= maxAttempts;
      Object.assign(record, {
        status: dead ? "dead" : "failed",
        nextAttemptAt: dead
          ? failedAt.toISOString()
          : new Date(failedAt.getTime() + backoffMs(record.attempts, baseBackoffMs, maxBackoffMs)).toISOString(),
        lockedAt: null,
        lockedBy: null,
        lastError: boundedError(error),
        updatedAt: failedAt.toISOString()
      });
      return clone(record);
    },
    get(id) {
      return clone(items.get(id) ?? null);
    },
    all() {
      return [...items.values()].map(clone);
    },
    list({ tenantId, status = null } = {}) {
      return [...items.values()]
        .filter((record) => (!tenantId || record.tenantId === tenantId) && (!status || record.status === status))
        .map(clone);
    },
    patch(id, changes) {
      const record = items.get(id);
      if (record) Object.assign(record, changes);
    },
    async replay({ id, tenantId, reason, now = Date.now() }) {
      const replayReason = normalizedReplayReason(reason);
      const record = items.get(id);
      if (!record || record.tenantId !== tenantId) return null;
      if (record.status !== "dead") throw new Error("Only dead outbox jobs can be replayed.");
      const replayedAt = nowIso(now);
      Object.assign(record, {
        status: "pending",
        attempts: 0,
        nextAttemptAt: replayedAt,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        replayCount: record.replayCount + 1,
        lastReplayedAt: replayedAt,
        lastReplayReason: replayReason,
        updatedAt: replayedAt,
        completedAt: null
      });
      return clone(record);
    },
    async checkReadiness(options = {}) {
      const health = { ...healthFromRecords([...items.values()], options), backend: "memory" };
      if (options.requireHealthy && !health.ready) throw healthError(health);
      return health;
    },
    async close() {}
  };
  return store;
}

function sqliteRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    event: JSON.parse(row.payload),
    idempotencyKey: row.idempotency_key,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at,
    lockedAt: row.locked_at,
    lockedBy: row.locked_by,
    lastError: row.last_error,
    replayCount: row.replay_count,
    lastReplayedAt: row.last_replayed_at,
    lastReplayReason: row.last_replay_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export function createSqliteOutboxStore({ filePath = DEFAULT_SQLITE_PATH } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  database.exec(SQLITE_SCHEMA);
  let closed = false;
  const selectById = database.prepare("SELECT * FROM outbox_jobs WHERE id = ?");
  const selectByKey = database.prepare("SELECT * FROM outbox_jobs WHERE idempotency_key = ?");

  return {
    backend: "sqlite",
    filePath,
    async enqueue(event, options = {}) {
      const job = newJob(event, options);
      database.prepare(
        "INSERT OR IGNORE INTO outbox_jobs " +
        "(id, tenant_id, event_type, aggregate_type, aggregate_id, idempotency_key, status, attempts, next_attempt_at, payload, created_at, updated_at) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(
        job.id, job.tenantId, event.eventType, event.aggregateType, event.aggregateId, job.idempotencyKey,
        job.status, job.attempts, job.nextAttemptAt, JSON.stringify(event), job.createdAt, job.updatedAt
      );
      const existing = sqliteRow(selectByKey.get(job.idempotencyKey));
      if (existing) {
        if (!sameLogicalEvent(existing, event)) throw idempotencyConflict();
        return existing;
      }
      if (selectById.get(job.id)) throw new Error("Outbox event id already exists with a different idempotency key.");
      throw new Error("SQLite outbox enqueue did not persist a job.");
    },
    async claim({ workerId, now = Date.now(), limit = 1, staleAfterMs = 60_000 }) {
      const claimedAt = nowIso(now);
      const staleBefore = nowIso(epoch(now) - staleAfterMs);
      database.exec("BEGIN IMMEDIATE");
      try {
        const rows = database.prepare(
          "SELECT id FROM outbox_jobs WHERE " +
          "((status IN ('pending','failed') AND next_attempt_at <= ?) OR " +
          "(status = 'processing' AND locked_at <= ?)) " +
          "ORDER BY next_attempt_at, created_at, id LIMIT ?"
        ).all(claimedAt, staleBefore, limit);
        const update = database.prepare(
          "UPDATE outbox_jobs SET status = 'processing', attempts = attempts + 1, locked_at = ?, locked_by = ?, updated_at = ? WHERE id = ?"
        );
        for (const row of rows) update.run(claimedAt, workerId, claimedAt, row.id);
        database.exec("COMMIT");
        return rows.map((row) => sqliteRow(selectById.get(row.id)));
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async complete({ id, workerId, now = Date.now() }) {
      const completedAt = nowIso(now);
      const result = database.prepare(
        "UPDATE outbox_jobs SET status = 'processed', locked_at = NULL, locked_by = NULL, last_error = NULL, " +
        "updated_at = ?, completed_at = ? WHERE id = ? AND status = 'processing' AND locked_by = ?"
      ).run(completedAt, completedAt, id, workerId);
      if (result.changes !== 1) throw new Error("Outbox job is not claimed by this worker.");
      return sqliteRow(selectById.get(id));
    },
    async fail({ id, workerId, error, now = Date.now(), maxAttempts = 5, baseBackoffMs = 1000, maxBackoffMs = 900_000 }) {
      const record = sqliteRow(selectById.get(id));
      if (!record || record.status !== "processing" || record.lockedBy !== workerId) {
        throw new Error("Outbox job is not claimed by this worker.");
      }
      const failedAt = nowDate(now);
      const dead = record.attempts >= maxAttempts;
      const next = dead ? failedAt : new Date(failedAt.getTime() + backoffMs(record.attempts, baseBackoffMs, maxBackoffMs));
      database.prepare(
        "UPDATE outbox_jobs SET status = ?, next_attempt_at = ?, locked_at = NULL, locked_by = NULL, last_error = ?, updated_at = ? " +
        "WHERE id = ? AND status = 'processing' AND locked_by = ?"
      ).run(dead ? "dead" : "failed", next.toISOString(), boundedError(error), failedAt.toISOString(), id, workerId);
      return sqliteRow(selectById.get(id));
    },
    async get(id) {
      return sqliteRow(selectById.get(id));
    },
    async list({ tenantId, status = null } = {}) {
      if (!tenantId) throw new Error("tenantId is required to list outbox jobs.");
      const rows = status
        ? database.prepare("SELECT * FROM outbox_jobs WHERE tenant_id = ? AND status = ? ORDER BY created_at, id").all(tenantId, status)
        : database.prepare("SELECT * FROM outbox_jobs WHERE tenant_id = ? ORDER BY created_at, id").all(tenantId);
      return rows.map(sqliteRow);
    },
    async replay({ id, tenantId, reason, now = Date.now() }) {
      const replayReason = normalizedReplayReason(reason);
      const replayedAt = nowIso(now);
      const result = database.prepare(
        "UPDATE outbox_jobs SET status = 'pending', attempts = 0, next_attempt_at = ?, locked_at = NULL, locked_by = NULL, " +
        "last_error = NULL, replay_count = replay_count + 1, last_replayed_at = ?, last_replay_reason = ?, updated_at = ?, completed_at = NULL " +
        "WHERE id = ? AND tenant_id = ? AND status = 'dead'"
      ).run(replayedAt, replayedAt, replayReason, replayedAt, id, tenantId);
      return result.changes === 1 ? sqliteRow(selectById.get(id)) : null;
    },
    async checkReadiness(options = {}) {
      database.prepare("SELECT 1").get();
      const records = database.prepare("SELECT status, locked_at FROM outbox_jobs").all().map((row) => ({
        status: row.status,
        lockedAt: row.locked_at
      }));
      const health = { ...healthFromRecords(records, options), backend: "sqlite" };
      if (options.requireHealthy && !health.ready) throw healthError(health);
      return health;
    },
    async close() {
      if (closed) return;
      database.close();
      closed = true;
    }
  };
}

function postgresRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    event: row.payload,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: new Date(row.next_attempt_at).toISOString(),
    lockedAt: row.locked_at ? new Date(row.locked_at).toISOString() : null,
    lockedBy: row.locked_by,
    lastError: row.last_error,
    replayCount: row.replay_count,
    lastReplayedAt: row.last_replayed_at ? new Date(row.last_replayed_at).toISOString() : null,
    lastReplayReason: row.last_replay_reason,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null
  };
}

export function createPostgresOutboxStore({ connectionString, poolOptions = {} }) {
  if (!connectionString) throw new Error("connectionString is required for the Postgres outbox.");
  let poolPromise = null;
  let closed = false;
  async function pool() {
    if (closed) throw new Error("Postgres outbox store is closed.");
    if (!poolPromise) {
      poolPromise = (async () => {
        const pg = (await import("pg")).default;
        const created = new pg.Pool({ connectionString, ...poolOptions });
        try {
          await assertPostgresMigrationsCurrent(created);
          return created;
        } catch (error) {
          await created.end();
          throw error;
        }
      })();
    }
    return poolPromise;
  }
  async function query(text, params = []) {
    return (await pool()).query(text, params);
  }

  return {
    backend: "postgres",
    async enqueue(event, options = {}) {
      const job = newJob(event, options);
      const inserted = await query(
        "INSERT INTO outbox_jobs " +
        "(id, tenant_id, event_type, event_version, aggregate_type, aggregate_id, idempotency_key, status, attempts, next_attempt_at, payload, created_at, updated_at) " +
        "VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',0,$8,$9,$8,$8) " +
        "ON CONFLICT (idempotency_key) DO NOTHING RETURNING *",
        [job.id, job.tenantId, event.eventType, event.eventVersion ?? 1, event.aggregateType, event.aggregateId,
          job.idempotencyKey, job.createdAt, event]
      );
      if (inserted.rows[0]) return postgresRow(inserted.rows[0]);
      const existing = await query("SELECT * FROM outbox_jobs WHERE idempotency_key = $1", [job.idempotencyKey]);
      const existingJob = postgresRow(existing.rows[0]);
      if (!sameLogicalEvent(existingJob, event)) throw idempotencyConflict();
      return existingJob;
    },
    async claim({ workerId, now = Date.now(), limit = 1, staleAfterMs = 60_000 }) {
      const p = await pool();
      const client = await p.connect();
      const claimedAt = nowDate(now);
      const staleBefore = new Date(claimedAt.getTime() - staleAfterMs);
      try {
        await client.query("BEGIN");
        const result = await client.query(
          "WITH candidates AS (" +
          "SELECT id FROM outbox_jobs WHERE " +
          "((status IN ('pending','failed') AND next_attempt_at <= $1) OR " +
          "(status = 'processing' AND locked_at <= $2)) " +
          "ORDER BY next_attempt_at, created_at, id FOR UPDATE SKIP LOCKED LIMIT $3" +
          ") UPDATE outbox_jobs AS jobs SET status = 'processing', attempts = jobs.attempts + 1, " +
          "locked_at = $1, locked_by = $4, updated_at = $1 FROM candidates " +
          "WHERE jobs.id = candidates.id RETURNING jobs.*",
          [claimedAt, staleBefore, limit, workerId]
        );
        await client.query("COMMIT");
        return result.rows.map(postgresRow);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async complete({ id, workerId, now = Date.now() }) {
      const completedAt = nowDate(now);
      const result = await query(
        "UPDATE outbox_jobs SET status = 'processed', locked_at = NULL, locked_by = NULL, last_error = NULL, " +
        "updated_at = $1, completed_at = $1 WHERE id = $2 AND status = 'processing' AND locked_by = $3 RETURNING *",
        [completedAt, id, workerId]
      );
      if (!result.rows[0]) throw new Error("Outbox job is not claimed by this worker.");
      return postgresRow(result.rows[0]);
    },
    async fail({ id, workerId, error, now = Date.now(), maxAttempts = 5, baseBackoffMs = 1000, maxBackoffMs = 900_000 }) {
      const recordResult = await query(
        "SELECT * FROM outbox_jobs WHERE id = $1 AND status = 'processing' AND locked_by = $2",
        [id, workerId]
      );
      const record = postgresRow(recordResult.rows[0]);
      if (!record) throw new Error("Outbox job is not claimed by this worker.");
      const failedAt = nowDate(now);
      const dead = record.attempts >= maxAttempts;
      const next = dead ? failedAt : new Date(failedAt.getTime() + backoffMs(record.attempts, baseBackoffMs, maxBackoffMs));
      const result = await query(
        "UPDATE outbox_jobs SET status = $1, next_attempt_at = $2, locked_at = NULL, locked_by = NULL, " +
        "last_error = $3, updated_at = $4 WHERE id = $5 AND status = 'processing' AND locked_by = $6 RETURNING *",
        [dead ? "dead" : "failed", next, boundedError(error), failedAt, id, workerId]
      );
      if (!result.rows[0]) throw new Error("Outbox job claim changed before failure recording.");
      return postgresRow(result.rows[0]);
    },
    async get(id) {
      return postgresRow((await query("SELECT * FROM outbox_jobs WHERE id = $1", [id])).rows[0]);
    },
    async list({ tenantId, status = null } = {}) {
      if (!tenantId) throw new Error("tenantId is required to list outbox jobs.");
      const result = status
        ? await query("SELECT * FROM outbox_jobs WHERE tenant_id = $1 AND status = $2 ORDER BY created_at, id", [tenantId, status])
        : await query("SELECT * FROM outbox_jobs WHERE tenant_id = $1 ORDER BY created_at, id", [tenantId]);
      return result.rows.map(postgresRow);
    },
    async replay({ id, tenantId, reason, now = Date.now() }) {
      const replayReason = normalizedReplayReason(reason);
      const replayedAt = nowDate(now);
      const result = await query(
        "UPDATE outbox_jobs SET status = 'pending', attempts = 0, next_attempt_at = $1, locked_at = NULL, locked_by = NULL, " +
        "last_error = NULL, replay_count = replay_count + 1, last_replayed_at = $1, last_replay_reason = $2, updated_at = $1, completed_at = NULL " +
        "WHERE id = $3 AND tenant_id = $4 AND status = 'dead' RETURNING *",
        [replayedAt, replayReason, id, tenantId]
      );
      return postgresRow(result.rows[0]);
    },
    async checkReadiness(options = {}) {
      const staleBefore = new Date(epoch(options.now ?? Date.now()) - (options.staleAfterMs ?? 60_000));
      const result = await query(
        "SELECT status, count(*)::int AS count, " +
        "count(*) FILTER (WHERE status = 'processing' AND locked_at <= $1)::int AS stale " +
        "FROM outbox_jobs GROUP BY status",
        [staleBefore]
      );
      const counts = Object.fromEntries([...JOB_STATUSES].map((status) => [status, 0]));
      let stale = 0;
      for (const row of result.rows) {
        assertJobStatus(row.status);
        counts[row.status] = row.count;
        stale += row.stale;
      }
      const health = {
        ready: stale === 0 && counts.dead <= (options.maxDeadJobs ?? 0),
        backend: "postgres",
        counts,
        stale,
        backlog: counts.pending + counts.failed + counts.processing
      };
      if (options.requireHealthy && !health.ready) throw healthError(health);
      return health;
    },
    async close() {
      if (closed) return;
      closed = true;
      if (!poolPromise) return;
      try {
        await (await poolPromise).end();
      } finally {
        poolPromise = null;
      }
    }
  };
}

export function createOutboxStoreFromEnv(env = process.env, { service = "api" } = {}) {
  const backend = String(
    env.XYGO_OUTBOX_BACKEND ?? (env.XYGO_API_REPOSITORY_MODE === "memory" ? "memory" : "sqlite")
  ).trim().toLowerCase();
  if (backend === "memory") return createOutboxStore();
  if (backend === "sqlite") {
    return createSqliteOutboxStore({
      filePath: env.XYGO_OUTBOX_SQLITE_PATH
        ? path.resolve(process.cwd(), env.XYGO_OUTBOX_SQLITE_PATH)
        : DEFAULT_SQLITE_PATH
    });
  }
  if (backend === "postgres") {
    return createPostgresOutboxStore({
      connectionString: env.XYGO_API_PG_URL,
      poolOptions: {
        ...postgresPoolOptionsFromEnvironment(env),
        application_name: `xygo-${service}-outbox`
      }
    });
  }
  throw new Error("XYGO_OUTBOX_BACKEND must be memory, sqlite, or postgres.");
}

export async function enqueueOutboxEvent(store, event, { idempotencyKey, now } = {}) {
  return store.enqueue(event, { idempotencyKey: idempotencyKey ?? defaultIdempotencyKey(event), now });
}

export async function processOutboxOnce({
  store,
  handler,
  now = Date.now(),
  maxAttempts = 5,
  baseBackoffMs = 1000,
  maxBackoffMs = 900_000,
  concurrency = 1,
  staleAfterMs = 60_000,
  workerId = `worker-${process.pid}-${crypto.randomUUID()}`
}) {
  const result = { processed: 0, retried: 0, dead: 0 };
  const jobs = await store.claim({ workerId, now, limit: concurrency, staleAfterMs });

  await Promise.all(jobs.map(async (job) => {
    try {
      await handler({ ...job.event, idempotencyKey: job.idempotencyKey, attempt: job.attempts });
      await store.complete({ id: job.id, workerId, now });
      result.processed += 1;
    } catch (error) {
      const failed = await store.fail({
        id: job.id,
        workerId,
        error,
        now,
        maxAttempts,
        baseBackoffMs,
        maxBackoffMs
      });
      if (failed.status === "dead") result.dead += 1;
      else result.retried += 1;
    }
  }));

  return result;
}

export const sharedOutbox = createOutboxStore();
