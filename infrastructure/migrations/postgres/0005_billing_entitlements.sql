-- Milestone 3: server-authoritative Stripe entitlement history.
ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS entitlement_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_provider_event_id TEXT;

ALTER TABLE subscription_events
  ADD COLUMN IF NOT EXISTS livemode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT 'processed'
    CHECK (outcome IN ('processed', 'ignored', 'duplicate', 'failed'));

CREATE INDEX IF NOT EXISTS idx_subscription_events_workspace_processed
  ON subscription_events(workspace_id, processed_at DESC);
