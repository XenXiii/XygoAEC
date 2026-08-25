CREATE TABLE IF NOT EXISTS privacy_requests (
  id TEXT PRIMARY KEY,
  email_lookup_hash CHAR(64) NOT NULL,
  email_ciphertext BYTEA NOT NULL,
  name_ciphertext BYTEA,
  request_type TEXT NOT NULL CHECK (request_type IN ('do_not_sell_or_share', 'access', 'deletion', 'correction')),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'verifying', 'processing', 'completed', 'rejected')),
  verification_token_hash CHAR(64),
  source TEXT NOT NULL DEFAULT 'website',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_email ON privacy_requests(email_lookup_hash, created_at DESC);

