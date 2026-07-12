# Phase 2 — Data Layer Design (Postgres)

**Status (2026-07-12): backend IMPLEMENTED, CI-verification pending.** Target chosen: **managed
Postgres**. The relational schema, `postgres` repository backend, async repository/handler
conversion, and a gated conformance suite are committed. The backend is **verified in CI** against
a Postgres 16 service (`.github/workflows/ci.yml` → `postgres` job); it is **not** runnable in the
offline dev sandbox, so it has not been exercised locally. Do not treat it as production-verified
until the CI `postgres` job is green against the managed instance.

Delivered:
- `infrastructure/migrations/postgres/0001_init.sql` — relational schema (FKs, indexes, seq-ordered audit).
- `apps/api/src/repositories/postgres.js` — same contract, lazy `pg` import, JSONB payload + promoted columns.
- Repository/handler chain converted sync → **async** (verified locally against memory/file/sqlite: 193 pass).
- `apps/api/test/postgres-conformance.test.js` — gated on `XYGO_TEST_PG_URL` (skips locally, runs in CI).
- `XYGO_API_REPOSITORY_MODE=postgres`, `XYGO_API_PG_URL=...`; `pg` added as the first dependency.

Still to do before production cutover: run migrations against the managed instance, enable
backups/PITR + a rehearsed restore drill, optionally enable RLS, and flip
`XYGO_API_REPOSITORY_MODE=postgres` in the production environment.

---

_Original design + decision gate below._

## Why this is gated

Current persistence (`0001_staged_api.sql`) is 8 opaque blob tables: `id/tenant_id/payload`,
**no foreign keys, no indexes beyond PK, no constraints** (blocker B5), **no backups/restore**
(B6). App code enforces all relational integrity. This does not scale and cannot recover.

Moving to Postgres requires:
1. A `pg` driver dependency (the first third-party dependency — justified: a production DB
   materially improves safety, which the dependency rule explicitly allows).
2. A running Postgres to test migrations, constraints, and the conformance parity suite.

Neither can be validated in the current sandbox, so this is a design + decision, not code.

## Target schema (relational, normalized)

```
tenants(id PK, name, created_at)
projects(id PK, tenant_id FK->tenants, name, project_type, status, payload JSONB, created_at)
issues(id PK, tenant_id FK, project_id FK->projects, title, description, status, severity,
       priority, disciplines JSONB, payload JSONB, created_at)
rfis(id PK, tenant_id FK, project_id FK, title, question, status, payload JSONB, created_at)
permit_packages(id PK, tenant_id FK, project_id FK, jurisdiction_profile, status,
                payload JSONB, created_at)
review_sessions(id PK, tenant_id FK, project_id FK, created_by, status, payload JSONB, created_at)
ai_review_runs(id PK, tenant_id FK, project_id FK, status, rule_version, model_version,
               payload JSONB, created_at)
ai_findings(id PK, tenant_id FK, review_run_id FK->ai_review_runs, category, severity,
            human_disposition, related_issue_id FK->issues NULL, payload JSONB, created_at)
audit_events(event_id PK, tenant_id FK, seq BIGSERIAL, action, resource_type, resource_id,
             previous_hash, event_hash, signature NULL, payload JSONB, created_at)
```

Key differences from the blob store:
- **Foreign keys** enforce tenant→project→child integrity at the DB (not just app code).
- **Indexes:** `(tenant_id)` on every table; `(project_id)`, `(review_run_id)` on children;
  `(tenant_id, seq)` on `audit_events` for ordered chain reads.
- **Constraints:** `NOT NULL` on business columns; CHECK/enum on `status`, `severity`,
  `human_disposition`; unique `(tenant_id, id)` defense-in-depth.
- **Hot fields promoted to columns**; full object retained in `payload JSONB` for forward-compat.
- **Row-Level Security (RLS)** option: `tenant_id = current_setting('xygo.tenant')` policy for
  defense-in-depth beneath the app-layer RBAC already shipped in Slice A.
- **`audit_events.seq`** gives a monotonic per-insert order independent of timestamps, and the
  HMAC `signature` column carries the Slice B tamper-proofing.

## Repository backend

- New `apps/api/src/repositories/postgres.js` implementing the SAME repository contract, added as
  a fourth backend to `repository-conformance.test.js` (run against a Postgres service container
  in CI). No handler/route changes — the contract is already backend-agnostic.
- `XYGO_API_REPOSITORY_MODE=postgres`, `XYGO_API_PG_URL=...`. `sqlite`/`file`/`memory` remain for
  local/dev/test.

## Migrations, backups, restore

- Ordered migration chain + a `schema_migrations` version table (replacing the single-file,
  version-less migration).
- Managed Postgres with automated backups + PITR; a documented + rehearsed restore drill
  (success criterion: restore-from-backup verified, not assumed).

## Test strategy (must pass before this is "done")

1. Conformance parity: `postgres` backend passes the identical suite as memory/file/sqlite.
2. Integrity: FK violations and bad enums are rejected by the DB.
3. Migration up/down on a clean database.
4. Restore-from-backup rehearsal.
5. Index/perf check: tenant-scoped reads use indexes (EXPLAIN), not full scans.

## DECISION REQUIRED

Before implementation, confirm the production persistence target:

- **A. Managed Postgres** (RDS / Cloud SQL / Neon / Supabase) — recommended; backups/PITR/HA
  handled by the provider. Adds `pg` dependency + a provisioned instance + a CI Postgres service.
- **B. Self-hosted Postgres** — full control, you operate backups/patching/HA.
- **C. Defer** — keep sqlite for now, revisit after Phases 3–4. (Blocks scale + compliance.)

And a secondary choice: **RLS on or off** (defense-in-depth vs. simpler ops), and whether to keep
`payload JSONB` alongside promoted columns (recommended for forward-compat) or go fully columnar.
