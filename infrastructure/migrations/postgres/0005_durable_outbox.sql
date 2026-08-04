CREATE TABLE IF NOT EXISTS outbox_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1 CHECK (event_version > 0),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'failed', 'processed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  replay_count INTEGER NOT NULL DEFAULT 0 CHECK (replay_count >= 0),
  last_replayed_at TIMESTAMPTZ,
  last_replay_reason TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK ((status = 'processing') = (locked_at IS NOT NULL AND locked_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_outbox_jobs_ready
  ON outbox_jobs(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_jobs_tenant
  ON outbox_jobs(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_jobs_stale
  ON outbox_jobs(locked_at) WHERE status = 'processing';
