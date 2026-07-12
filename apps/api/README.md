# apps/api

Staged read-only HTTP surface for Xygo.

Current endpoints:
- `GET /health`
- `GET /v1/tenants/:tenantId/projects`
- `POST /v1/tenants/:tenantId/projects`
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
- override file path with `XYGO_API_DATA_PATH=relative/path.json`
- override sqlite path with `XYGO_API_DB_PATH=relative/path.sqlite`

This surface is staged-only.
Current write scope is limited to staged in-memory project, coordination-issue, RFI, permit-package, review-session, AI-review-run, and AI-finding/disposition creation/update.
Every staged write now appends a tenant-scoped audit event with hash chaining.
