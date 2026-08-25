-- Secure client-audit funnel and subscription foundation.
-- Direct personal fields are encrypted by the application before insertion.
-- *_lookup_hash values are keyed HMAC-SHA256 digests, never plain hashes.

CREATE TABLE IF NOT EXISTS client_users (
  id TEXT PRIMARY KEY,
  email_lookup_hash CHAR(64) NOT NULL UNIQUE,
  email_ciphertext BYTEA NOT NULL,
  phone_lookup_hash CHAR(64),
  phone_ciphertext BYTEA,
  name_ciphertext BYTEA NOT NULL,
  address_ciphertext BYTEA,
  encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  email_verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'active', 'disabled', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_users_phone_hash ON client_users(phone_lookup_hash)
  WHERE phone_lookup_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('password', 'google', 'microsoft', 'yahoo', 'enterprise_sso')),
  provider_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ,
  UNIQUE (provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS idx_client_identities_user ON client_identities(user_id);

CREATE TABLE IF NOT EXISTS client_workspaces (
  id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  industry TEXT,
  employee_range TEXT,
  revenue_range TEXT,
  website TEXT,
  business_address_ciphertext BYTEA,
  encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (status IN ('onboarding', 'active', 'past_due', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_workspace_members (
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'advisor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON client_workspace_members(user_id);

CREATE TABLE IF NOT EXISTS client_consents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms', 'privacy', 'marketing', 'data_processing', 'integration_access')),
  document_version TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  ip_address_ciphertext BYTEA,
  user_agent_ciphertext BYTEA,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_consents_workspace ON client_consents(workspace_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS business_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  connection_type TEXT NOT NULL CHECK (connection_type IN ('dashboard', 'accounting', 'crm', 'email', 'calendar', 'analytics', 'other')),
  external_account_hash CHAR(64),
  credential_reference TEXT,
  requested_scopes TEXT[] NOT NULL DEFAULT '{}',
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'error', 'revoked')),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (credential_reference IS NULL OR credential_reference NOT LIKE '%token=%')
);
CREATE INDEX IF NOT EXISTS idx_business_connections_workspace ON business_connections(workspace_id, status);

CREATE TABLE IF NOT EXISTS audit_engagements (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES client_users(id),
  status TEXT NOT NULL DEFAULT 'intake'
    CHECK (status IN ('intake', 'data_collection', 'analyzing', 'free_result_ready', 'full_result_ready', 'archived')),
  industry TEXT,
  objectives JSONB NOT NULL DEFAULT '[]',
  progress_percent SMALLINT NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  free_solution_unlocked_at TIMESTAMPTZ,
  full_results_unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_engagements_workspace ON audit_engagements(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_intake_responses (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  section_key TEXT NOT NULL,
  response_ciphertext BYTEA NOT NULL,
  encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'import', 'integration')),
  submitted_by TEXT REFERENCES client_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (engagement_id, section_key)
);
CREATE INDEX IF NOT EXISTS idx_audit_responses_workspace ON audit_intake_responses(workspace_id);

CREATE TABLE IF NOT EXISTS audit_results (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  result_type TEXT NOT NULL CHECK (result_type IN ('free_solution', 'finding', 'benchmark', 'scaling_scenario', 'implementation_plan')),
  access_level TEXT NOT NULL CHECK (access_level IN ('free', 'paid', 'enterprise')),
  title TEXT NOT NULL,
  result_ciphertext BYTEA NOT NULL,
  encryption_key_version SMALLINT NOT NULL DEFAULT 1,
  source_metadata JSONB NOT NULL DEFAULT '{}',
  confidence NUMERIC(5,4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_results_access ON audit_results(workspace_id, engagement_id, access_level);

CREATE TABLE IF NOT EXISTS client_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe' CHECK (provider = 'stripe'),
  provider_customer_id TEXT NOT NULL,
  provider_subscription_id TEXT UNIQUE,
  plan_code TEXT NOT NULL CHECK (plan_code IN ('basic', 'premium', 'business', 'enterprise')),
  status TEXT NOT NULL CHECK (status IN ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  introductory_price_cents INTEGER CHECK (introductory_price_cents >= 0),
  recurring_price_cents INTEGER CHECK (recurring_price_cents >= 0),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_workspace ON client_subscriptions(workspace_id, status);

CREATE TABLE IF NOT EXISTS subscription_events (
  provider_event_id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES client_workspaces(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS client_data_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES client_workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES client_users(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('export', 'correction', 'deletion')),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'completed', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_client_data_requests_workspace ON client_data_requests(workspace_id, requested_at DESC);

