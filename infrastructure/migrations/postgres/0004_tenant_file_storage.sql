CREATE TABLE IF NOT EXISTS file_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  field_report_id TEXT REFERENCES field_reports(id) ON DELETE SET NULL,
  file_class TEXT NOT NULL CHECK (file_class IN ('document', 'evidence', 'report_attachment', 'report_photo')),
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending_upload', 'ready', 'deleting', 'deleted')),
  checksum_sha256 TEXT,
  client_visible BOOLEAN NOT NULL DEFAULT false,
  retention_until TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_records_tenant ON file_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_file_records_project ON file_records(tenant_id, project_id);
CREATE INDEX IF NOT EXISTS idx_file_records_report ON file_records(tenant_id, field_report_id);
CREATE INDEX IF NOT EXISTS idx_file_records_cleanup ON file_records(status, retention_until);
