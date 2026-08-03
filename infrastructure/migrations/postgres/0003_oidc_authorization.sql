CREATE TABLE IF NOT EXISTS oidc_identities (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (issuer, subject),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_oidc_identities_tenant ON oidc_identities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_oidc_identities_user ON oidc_identities(user_id);
