# Managed PostgreSQL Operations Runbook

This runbook defines the staging and production database procedure for Xygo. It is an operational
contract only: it does not create a managed database, install credentials, enable provider backups,
or execute a deployment. Every command must run with environment-specific secrets supplied at
runtime by the approved secret manager.

## Safety invariants

- Application processes never apply PostgreSQL migrations. `npm run start:api` performs a read-only
  connectivity and schema-version preflight before listening; a pending or unexpected migration
  fails startup.
- Only the release migration job may run `npm run migrate:postgres`. The migration runner serializes
  concurrent attempts with a PostgreSQL advisory lock and applies each pending migration in its own
  transaction.
- Migrations are forward-only. Never edit or rename an applied migration, and never run an ad hoc
  down migration against staging or production.
- A deployment is not approved until the managed service has encrypted connections, automated
  backups/PITR, an owner, an alert route, and a successfully timed restore drill.
- Never use `XYGO_TEST_PG_URL` against staging or production. Conformance tests create and mutate
  synthetic tenant data.

## Required access and separation

Use separate managed-service credentials even though each process receives its URL under the same
environment key:

- The migration job receives `XYGO_API_PG_URL` for a short-lived migration role that can execute the
  checked-in DDL and update `schema_migrations`.
- API runtime receives `XYGO_API_PG_URL` for the least-privilege application role. It must read and
  write application tables but should not own the database or have schema-changing privileges.
- Human operators use an independently audited break-glass role only for an approved incident or
  restore. Do not inject it into an application process.

Before staging approval, record the provider/database identifier, region, PostgreSQL major version,
runtime and migration role names, backup policy, retention, PITR window, encryption settings,
maintenance window, connection limit, incident owner, and restore owner. Store identifiers—not
passwords—in the deployment record.

## Connection pool contract

Production API and worker manifests must set:

- `XYGO_PG_POOL_MAX`: 1–50 connections per process; start at 10 for the API.
- `XYGO_PG_IDLE_TIMEOUT_MS`: 1,000–300,000 ms; the example uses 30,000.
- `XYGO_PG_CONNECTION_TIMEOUT_MS`: 1,000–30,000 ms; the example uses 5,000.

Budget connections before changing replica counts:

```text
(API replicas × API pool max) + (worker replicas × worker pool max) + migration/admin reserve
  <= 80% of the provider connection limit
```

Keep at least 20% available for provider maintenance, readiness probes, incident access, and brief
deployment overlap. Lower per-process pools before scaling replicas. Use the provider's supported
pooler when direct connection budgets are too small; do not silently raise the application maximum.
Local/staged development may omit the pool variables and use the bounded defaults.

## Staging and production deployment sequence

Use the same immutable release artifact for the migration job and application processes.

1. Confirm the target environment and release SHA. Verify the URL came from the correct secret
   binding without printing it.
2. Confirm the latest automated backup/PITR point is healthy. For a migration with destructive or
   long-running operations, create and record a provider snapshot immediately before proceeding.
3. Put the deployment in a single-concurrency group so only one migration job targets the database.
4. Run the migration step from the release artifact:

   ```bash
   npm ci --omit=dev
   npm run migrate:postgres
   npm run check:postgres
   ```

5. Require the readiness output to report `"ready":true` and the exact migration chain expected by
   the release. Stop if any migration is pending or unexpected.
6. Start or roll the API. Startup must complete its read-only PostgreSQL preflight before the process
   listens. Do not bypass this check.
7. Probe `GET /health` for process liveness and `GET /ready` for database connectivity plus schema
   readiness. Route traffic only after `/ready` returns HTTP 200.
8. Run tenant-scoped smoke reads, audit verification, and the release smoke checklist. Do not run the
   destructive PostgreSQL conformance suite against this database.
9. Record the release SHA, migration versions, migration job link, backup/PITR evidence, readiness
   result, operator, timestamps, and rollback decision window.

CI is deliberately different: its PostgreSQL job creates a disposable PostgreSQL 16 service,
applies the migrations twice, runs `npm run check:postgres`, and then runs the mutating conformance
suite with `XYGO_REQUIRE_PG_TESTS=true`. Staging and production migration jobs must not set
`XYGO_TEST_PG_URL` or run `npm run test:postgres`.

## Readiness behavior

- `GET /health` is a liveness probe and does not prove database access.
- `GET /ready` is a readiness probe. It returns 503 while draining, when PostgreSQL cannot be
  reached, or when `schema_migrations` is missing, pending, or contains versions unknown to the
  release.
- Direct API startup runs the same check before `listen`. A failure exits nonzero and logs only a
  stable error code; it must not log the connection URL.
- `npm run check:postgres` is the operator-facing, read-only equivalent. It may be run after restore,
  after migration, and during incident diagnosis.

## Backup checklist

Complete this for each staging/production database before deployment approval:

- [ ] Automated backups are enabled and encrypted with the approved key policy.
- [ ] PITR/WAL retention is enabled and the documented window covers the approved recovery-point
      objective (RPO).
- [ ] Backup retention, deletion protection, cross-region/account requirements, and provider health
      alerts have named owners.
- [ ] The most recent successful backup or PITR point, timestamp, and provider identifier are recorded.
- [ ] The restore role can create an isolated target without changing the live database.
- [ ] The approved recovery-time objective (RTO) and RPO are written in the release record.
- [ ] A timed restore drill has passed within the required review interval.
- [ ] Backup failure and storage-capacity alerts reach the incident owner.

Provider backup status is evidence; a successful restore is proof. Do not mark this checklist complete
from a dashboard showing only that backups are scheduled.

## Timed restore drill

Run the drill against an isolated, non-routable database. Never overwrite the source database.

1. Create a drill record with source database identifier, chosen backup/PITR timestamp, release SHA,
   expected RTO/RPO, operator, and start time (`T0`). Start a wall-clock timer.
2. Restore the chosen point to a new provider-managed database using the approved encryption,
   network, PostgreSQL version, and parameter settings. Record provider job IDs and completion time.
3. Bind a temporary read-only verification secret to `XYGO_API_PG_URL`; do not print it.
4. From the matching release artifact, run:

   ```bash
   npm ci --omit=dev
   npm run check:postgres
   ```

5. Compare the restored `schema_migrations` versions, tenant/project counts, latest provisioning and
   audit-event timestamps, and selected tenant-scoped records with the source evidence captured for
   the chosen recovery point. Run the audit-chain verifier on an approved export or smoke path.
6. Start an isolated API instance and require `/health` and `/ready` to pass. Perform read-only,
   tenant-scoped portal and project smoke checks; prove a cross-tenant request remains denied.
7. Stop the timer only after technical verification succeeds. Record achieved RTO, observed data-loss
   interval/RPO, all failed or manual steps, and the go/no-go result.
8. If either objective is missed, keep staging/production approval blocked, assign corrective work,
   and repeat the drill.
9. After evidence is retained and change approval is recorded, remove the temporary secret and delete
   the isolated restore through the provider's recoverable workflow. Never include deletion in an
   unattended test script.

## Failed migration or deployment rollback

### Migration command fails before app rollout

Each migration transaction rolls back on error. Stop the deployment, retain the job logs, run
`npm run check:postgres`, and inspect `schema_migrations`. Do not start the new release. Fix forward
with a new numbered migration and rerun CI; never edit a migration already recorded in a shared
environment.

### New application fails but the migration succeeded

Stop the rollout and keep the database at the forward schema. Redeploy the last known-good application
only if the migration was reviewed as backward-compatible with it. Confirm `/ready`, tenant-scoped
smoke reads, and audit verification. Otherwise keep traffic off and ship a forward-compatible fix.

### Migration committed incompatible or destructive data changes

Disable writes and preserve the failed database for evidence. Restore the pre-deploy snapshot or PITR
point to a new managed database, execute the timed verification steps above, and switch the runtime
secret only through an approved change. Re-run readiness and smoke checks before routing traffic.
Do not drop, overwrite, or mutate the failed database until the incident owner approves retention and
cleanup.

## Local disposable PostgreSQL

Local PostgreSQL use remains explicit:

```bash
export XYGO_API_PG_URL='<local-disposable-postgres-url>'
export XYGO_TEST_PG_URL="$XYGO_API_PG_URL"
npm run migrate:postgres
npm run migrate:postgres
npm run check:postgres
npm run test:postgres
```

An unset test URL may skip locally. CI sets `XYGO_REQUIRE_PG_TESTS=true`, so its PostgreSQL suite
cannot pass by skipping. Never reuse staging or production for local or CI tests.
