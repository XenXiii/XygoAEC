CREATE TABLE IF NOT EXISTS email_suppressions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  normalized_recipient TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('bounce', 'complaint', 'provider_suppression', 'unsubscribe')),
  source TEXT NOT NULL CHECK (source IN ('provider_webhook')),
  provider_event_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (tenant_id, normalized_recipient)
);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_tenant
  ON email_suppressions(tenant_id, updated_at DESC);
