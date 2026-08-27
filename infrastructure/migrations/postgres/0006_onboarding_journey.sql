-- Persisted onboarding + audit-intent journey. The submitted homepage objective
-- and business details survive authentication and every onboarding step here
-- instead of living in browser-only state. Sensitive fields are encrypted by the
-- application; the database stores ciphertext plus queryable lifecycle columns.
CREATE TABLE IF NOT EXISTS onboarding_journeys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES client_workspaces(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES client_users(id) ON DELETE SET NULL,
  state TEXT NOT NULL CHECK (state IN (
    'objective_submitted','profile_pending','business_pending','plan_pending',
    'connections_pending_or_skipped','audit_queued','audit_running','audit_completed','workspace_ready'
  )),
  applied_events TEXT[] NOT NULL DEFAULT '{}',
  payload_ciphertext BYTEA NOT NULL,
  encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_journeys_owner ON onboarding_journeys(owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_journeys_workspace ON onboarding_journeys(workspace_id);
