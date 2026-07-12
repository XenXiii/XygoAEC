-- Xygo production relational schema (Postgres). Replaces the staged blob store
-- (single-file sqlite migration) with foreign keys, indexes, and constraints.
-- Applied by the ordered migration runner; tracked in schema_migrations.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'commercial',
  status TEXT NOT NULL DEFAULT 'draft',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NOT NULL DEFAULT 'medium',
  priority TEXT NOT NULL DEFAULT 'medium',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_issues_tenant ON issues(tenant_id);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);

CREATE TABLE IF NOT EXISTS rfis (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  question TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rfis_tenant ON rfis(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rfis_project ON rfis(project_id);

CREATE TABLE IF NOT EXISTS permit_packages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  jurisdiction_profile TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'package_preparation',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_permits_tenant ON permit_packages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_permits_project ON permit_packages(project_id);

CREATE TABLE IF NOT EXISTS review_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  created_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_review_sessions_tenant ON review_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_review_sessions_project ON review_sessions(project_id);

CREATE TABLE IF NOT EXISTS ai_review_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'queued',
  rule_version TEXT,
  model_version TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_tenant ON ai_review_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_runs_project ON ai_review_runs(project_id);

CREATE TABLE IF NOT EXISTS ai_findings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  review_run_id TEXT NOT NULL REFERENCES ai_review_runs(id),
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  human_disposition TEXT NOT NULL DEFAULT 'pending',
  related_issue_id TEXT REFERENCES issues(id),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_findings_tenant ON ai_findings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_findings_run ON ai_findings(review_run_id);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  seq BIGSERIAL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  previous_hash TEXT,
  event_hash TEXT NOT NULL,
  signature TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Ordered per-tenant chain reads (replaces sqlite rowid ordering).
CREATE INDEX IF NOT EXISTS idx_audit_tenant_seq ON audit_events(tenant_id, seq);

-- Optional defense-in-depth beneath the app-layer RBAC (Slice A). Enable per
-- deployment; the app sets `SET LOCAL xygo.tenant = $1` per request/transaction.
-- ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON projects
--   USING (tenant_id = current_setting('xygo.tenant', true));
-- (repeat per table)
