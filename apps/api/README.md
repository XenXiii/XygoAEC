# apps/api

Staged read-only HTTP surface for Xygo.

Current endpoints:
- `GET /health`
- `GET /ready` (database connectivity and migration readiness for PostgreSQL)
- `GET /v1/tenants/:tenantId/projects`
- `POST /v1/tenants/:tenantId/projects`
- `GET /v1/tenants/:tenantId/files`
- `POST /v1/tenants/:tenantId/files/upload-intents`
- `PUT /v1/tenants/:tenantId/files/:fileId/content` (authenticated local-development proxy only)
- `POST /v1/tenants/:tenantId/files/:fileId/complete`
- `GET /v1/tenants/:tenantId/files/:fileId/download`
- `GET /v1/tenants/:tenantId/files/:fileId/content` (authenticated local-development proxy only)
- `DELETE /v1/tenants/:tenantId/files/:fileId`
- `GET /v1/tenants/:tenantId/issues`
- `POST /v1/tenants/:tenantId/issues`
- `GET /v1/tenants/:tenantId/rfis`
- `POST /v1/tenants/:tenantId/rfis`
- `GET /v1/tenants/:tenantId/permits`
- `POST /v1/tenants/:tenantId/permits`
- `GET /v1/tenants/:tenantId/review-sessions`
- `POST /v1/tenants/:tenantId/review-sessions`
- `GET /v1/tenants/:tenantId/ai-review-runs`
- `POST /v1/tenants/:tenantId/ai-review-runs`
- `GET /v1/tenants/:tenantId/ai-findings`
- `POST /v1/tenants/:tenantId/ai-findings`
- `POST /v1/tenants/:tenantId/ai-findings/:findingId/disposition`
- `GET /v1/tenants/:tenantId/audit-events`
- `GET /v1/tenants/:tenantId/audit-events/verify`
- `GET /v1/tenants/:tenantId/dashboard/executive`
- `GET /v1/tenants/:tenantId/transfers`

Headers:
- `x-staged-tenant-id`
- `x-staged-user-id` optional

Run locally:

```bash
node apps/api/src/server.js
```

Repository modes:
- default: sqlite-backed staged persistence at `infrastructure/staged-data/api-store.sqlite`
- file fallback: `XYGO_API_REPOSITORY_MODE=file`
- override with `XYGO_API_REPOSITORY_MODE=memory`
- production Postgres: `XYGO_API_REPOSITORY_MODE=postgres` with an explicitly migrated database;
  application startup verifies migrations but never applies them
- staged Postgres can opt into synthetic seed records with `XYGO_PG_SEED_SYNTHETIC_DATA=true`;
  production validation rejects that setting
- override file path with `XYGO_API_DATA_PATH=relative/path.json`
- override sqlite path with `XYGO_API_DB_PATH=relative/path.sqlite`

File bytes use local private storage at `infrastructure/staged-data/uploads` by default. Production
uses private S3-compatible storage with presigned upload/download targets; file metadata and audit
links remain canonical PostgreSQL records. See `docs/operations/tenant-file-storage-runbook.md`.

Local API and worker processes share a WAL-enabled SQLite outbox by default. Production requires
`XYGO_OUTBOX_BACKEND=postgres` and migration `0005_durable_outbox`; `/ready` includes outbox health.
See `docs/operations/durable-worker-outbox-runbook.md`.

This surface is staged-only.
Current write scope is limited to staged repository-backed project, coordination-issue, RFI, permit-package, review-session, field-report, file, AI-review-run, and AI-finding/disposition creation/update.
Every staged write now appends a tenant-scoped audit event with hash chaining.
