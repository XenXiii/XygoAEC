CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rfis (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS permit_packages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_review_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_findings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  review_run_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_blueprints (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS field_reports (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  field_report_id TEXT,
  status TEXT NOT NULL,
  payload TEXT NOT NULL
);

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

CREATE TABLE IF NOT EXISTS email_deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  recipient_user_id TEXT,
  recipient_email TEXT NOT NULL,
  kind TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_message_id TEXT UNIQUE,
  provider_status_at TEXT,
  last_error TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accepted_at TEXT,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_staged_email_deliveries_tenant_status
  ON email_deliveries(tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS email_webhook_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_heartbeats (
  service_name TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  details TEXT NOT NULL,
  PRIMARY KEY (service_name, instance_id)
);

CREATE INDEX IF NOT EXISTS idx_staged_file_records_tenant ON file_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_staged_file_records_project ON file_records(tenant_id, project_id);
