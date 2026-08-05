CREATE TABLE IF NOT EXISTS web_auth_sessions (
  session_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('login_transaction', 'user_session')),
  encrypted_payload BYTEA NOT NULL,
  encryption_iv BYTEA NOT NULL,
  encryption_tag BYTEA NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_web_auth_sessions_expiry
  ON web_auth_sessions (LEAST(idle_expires_at, absolute_expires_at));
