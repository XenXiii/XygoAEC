CREATE UNIQUE INDEX IF NOT EXISTS idx_users_id_tenant
  ON users(id, tenant_id);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_user_id TEXT,
  recipient_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('activation', 'report_ready', 'portal_update')),
  resource_type TEXT,
  resource_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'accepted', 'delivered', 'delayed', 'failed', 'bounced', 'complained', 'suppressed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  provider TEXT,
  provider_message_id TEXT UNIQUE,
  provider_status_at TIMESTAMPTZ,
  last_error TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  FOREIGN KEY (recipient_user_id, tenant_id) REFERENCES users(id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_email_deliveries_tenant_status
  ON email_deliveries(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_email_deliveries_health
  ON email_deliveries(status, updated_at);

CREATE TABLE IF NOT EXISTS email_webhook_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_webhook_provider_message
  ON email_webhook_events(provider, provider_message_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_email_webhook_tenant
  ON email_webhook_events(tenant_id, occurred_at);

CREATE TABLE IF NOT EXISTS service_heartbeats (
  service_name TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'degraded', 'stopping')),
  last_seen_at TIMESTAMPTZ NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (service_name, instance_id)
);

CREATE INDEX IF NOT EXISTS idx_service_heartbeats_service_seen
  ON service_heartbeats(service_name, last_seen_at DESC);
