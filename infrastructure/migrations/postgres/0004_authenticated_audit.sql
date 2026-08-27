-- Milestone 2 authenticated conversational audit. Sensitive text is encrypted
-- by the application before insertion; the database stores ciphertext only.
ALTER TABLE client_workspace_members DROP CONSTRAINT IF EXISTS client_workspace_members_role_check;
ALTER TABLE client_workspace_members ADD CONSTRAINT client_workspace_members_role_check
  CHECK (role IN ('owner','admin','staff','advisor','read_only_auditor'));
ALTER TABLE client_workspace_members ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','revoked'));
ALTER TABLE client_workspace_members ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  email_lookup_hash CHAR(64) NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','staff','advisor','read_only_auditor')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','expired')),
  created_by TEXT NOT NULL REFERENCES client_users(id), expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), accepted_by TEXT REFERENCES client_users(id), accepted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_scope ON workspace_invitations(workspace_id,status);

CREATE TABLE IF NOT EXISTS audit_conversations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES client_users(id), title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','archived')), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_conversations_scope ON audit_conversations(workspace_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS audit_messages (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES audit_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system','tool')),
  content_ciphertext BYTEA NOT NULL, structured_ciphertext BYTEA, encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  model_version TEXT, prompt_version TEXT, validation_status TEXT CHECK (validation_status IN ('valid','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_messages_scope ON audit_messages(workspace_id,conversation_id,created_at);

CREATE TABLE IF NOT EXISTS audit_structured_facts (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES audit_conversations(id) ON DELETE CASCADE, stage TEXT NOT NULL, fact_key TEXT NOT NULL,
  value_ciphertext BYTEA NOT NULL, source_type TEXT NOT NULL CHECK (source_type IN ('connected','imported','manual','conversation')),
  confidence TEXT NOT NULL CHECK (confidence IN ('low','medium','high')), owner_user_id TEXT REFERENCES client_users(id),
  evidence_ref TEXT, encryption_key_version SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id,conversation_id,fact_key)
);
CREATE INDEX IF NOT EXISTS idx_audit_facts_scope ON audit_structured_facts(workspace_id,conversation_id);

CREATE TABLE IF NOT EXISTS audit_fact_conflicts (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES audit_conversations(id) ON DELETE CASCADE, fact_key TEXT NOT NULL,
  fact_ids TEXT[] NOT NULL, status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved','resolved')),
  resolution_ciphertext BYTEA, encryption_key_version SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_audit_conflicts_scope ON audit_fact_conflicts(workspace_id,conversation_id,status);

CREATE TABLE IF NOT EXISTS audit_evidence_refs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES audit_conversations(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, source_record_hash CHAR(64), label_ciphertext BYTEA NOT NULL,
  owner_user_id TEXT REFERENCES client_users(id), confidence TEXT CHECK (confidence IN ('low','medium','high')),
  encryption_key_version SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_evidence_scope ON audit_evidence_refs(workspace_id,conversation_id);

CREATE TABLE IF NOT EXISTS audit_states (
  conversation_id TEXT PRIMARY KEY REFERENCES audit_conversations(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE, current_stage TEXT NOT NULL,
  completed_stages TEXT[] NOT NULL DEFAULT '{}', readiness SMALLINT NOT NULL DEFAULT 0 CHECK(readiness BETWEEN 0 AND 100),
  evidence_coverage SMALLINT NOT NULL DEFAULT 0 CHECK(evidence_coverage BETWEEN 0 AND 100), confidence TEXT NOT NULL,
  free_result_eligible BOOLEAN NOT NULL DEFAULT false, state_ciphertext BYTEA NOT NULL,
  encryption_key_version SMALLINT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_states_scope ON audit_states(workspace_id,conversation_id);

CREATE TABLE IF NOT EXISTS audit_tool_invocations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES audit_conversations(id) ON DELETE CASCADE, requested_by TEXT NOT NULL REFERENCES client_users(id),
  tool_name TEXT NOT NULL, arguments_ciphertext BYTEA NOT NULL, idempotency_key TEXT NOT NULL,
  approval_status TEXT NOT NULL CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  status TEXT NOT NULL CHECK (status IN ('requested','accepted','completed','failed','cancelled')),
  encryption_key_version SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(workspace_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS audit_canvas_snapshots (
  id BIGSERIAL PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES audit_conversations(id) ON DELETE CASCADE,
  projection_ciphertext BYTEA NOT NULL, encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  schema_version SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_canvas_snapshots_scope ON audit_canvas_snapshots(workspace_id,conversation_id,created_at DESC);

CREATE TABLE IF NOT EXISTS audit_request_idempotency (
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES audit_conversations(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL, response_ciphertext BYTEA NOT NULL,
  encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(workspace_id,conversation_id,idempotency_key)
);

-- Deployment applies equivalent workspace-scoped RLS policies after the app
-- transaction sets `xygo.workspace_id`; app-layer membership checks remain mandatory.
