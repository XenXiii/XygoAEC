# Canonical Postgres Provisioning

Paid-client staging provisioning writes only to the application Postgres repository. The command no
longer creates a separate JSON store. It remains staged-only and does not create identity-provider
accounts. Managed-provider invitation and the subsequent canonical identity binding are separate,
reviewed steps described in [Managed IdP Runtime Contract](managed-idp-runtime.md).

## Environment

- `XYGO_API_PG_URL`: application Postgres connection string used by the provisioning command.
- `XYGO_TEST_PG_URL`: disposable Postgres connection string used by the conformance tests.

Store both values in the approved local or CI secret store; never commit them. For local testing they
may point to the same disposable database. Do not point conformance tests at a shared staging or
production database because the suite creates synthetic records.

Example shell setup, with the value supplied by the operator's secret manager:

```bash
export XYGO_TEST_PG_URL='<disposable-postgres-url>'
export XYGO_API_PG_URL="$XYGO_TEST_PG_URL"
npm run migrate:postgres
npm run migrate:postgres
npm run check:postgres
npm run test:postgres
```

An unset `XYGO_TEST_PG_URL` causes the Postgres tests to skip explicitly. A release gate must provide
the variable and require the tests to execute rather than accept a skip.

The GitHub Actions Postgres job supplies both URLs only to its disposable Postgres 16 service job,
sets `XYGO_REQUIRE_PG_TESTS=true`, applies migrations twice, verifies readiness without mutation, and
then runs `npm run test:postgres`.
Required mode exits with an error if `XYGO_TEST_PG_URL` is absent, so that job cannot pass by skip.

## Migrations

The deployment-only `npm run migrate:postgres` command applies ordered SQL migrations and records them
in `schema_migrations`:

1. `0001_init.sql`
2. `0002_paid_client_provisioning.sql`
3. `0003_oidc_authorization.sql`
4. `0004_tenant_file_storage.sql`
5. `0005_durable_outbox.sql`
6. `0006_email_monitoring.sql`
7. `0007_email_suppressions.sql`
8. `0008_web_auth_sessions.sql`

The second migration adds canonical users, paid-client role assignments, business profiles, portal
configuration, portal seed data, and provisioning events. Provisioning also uses the existing
projects, platform-blueprints, tenants, and audit-event tables.

The third migration adds explicit OIDC issuer/subject bindings. A verified token identifies an OIDC
subject, but the API derives the internal user, tenant, and paid-client role only from the matching
active Postgres user, tenant, role assignment, and identity binding. Token tenant and role claims do
not authorize access.

The fifth migration adds the durable PostgreSQL outbox used by API transactions and safe worker
claims. See the [Durable Worker and Outbox Operations Runbook](../operations/durable-worker-outbox-runbook.md)
for retry, dead-letter, replay, readiness, and shutdown behavior.

The sixth migration adds tenant-scoped email delivery/status records, verified provider-event
deduplication, and worker heartbeats. See the
[Email Delivery and Monitoring Operations Runbook](../operations/email-monitoring-runbook.md).

The eighth migration adds the encrypted server-side web authentication store used across web-process
restarts and horizontally scaled instances.

The conformance suite checks the actual table names, recorded migration versions, canonical
repository reads, cross-tenant project/user separation, portal branding/update separation,
idempotency, conflict rejection, audit records, and full rollback after a forced error.

The application repository never applies migrations. It checks connectivity and requires the exact
migration chain before use; production API startup performs that read-only check before listening.
Provisioning and identity-binding commands also require the target database to be migrated first.
See the [Managed PostgreSQL Operations Runbook](../operations/managed-postgres-runbook.md) for the
staging/production migration, pool, backup, restore-drill, and rollback procedures.

## Provision A Staged Tenant

Create the input JSON outside the repository, then run:

```bash
XYGO_API_PG_URL='<staging-postgres-url>' \
  npm run provision:tenant -- --config /secure/path/client.json --approve-staged
```

The repository obtains a tenant-scoped Postgres advisory transaction lock, checks the canonical
provisioning key, and inserts every record plus its audit event in one transaction. An identical rerun
returns `created: false`; changed input for the same slug fails. Any insert or pre-commit failure rolls
back the entire tenant.

This flow does not change `XYGO_AUTH_MODE`. Until real OIDC activation is completed, only synthetic
staging data may be provisioned.

## Bind A Provisioned User To OIDC

Do not edit and rerun an existing tenant's provisioning input to add a subject: the canonical
provisioning key correctly treats that as conflicting input. Instead, invite the user through the
managed provider, verify its immutable subject, and run `npm run bind:oidc-user` as documented in
[Managed IdP Runtime Contract](managed-idp-runtime.md). The binding is Postgres-only, idempotent,
conflict-safe, transactional, and audited.

OIDC mode requires `XYGO_API_REPOSITORY_MODE=postgres`; startup fails closed for file, SQLite, or
memory repositories. Production additionally requires a supported provider name and an explicit
HTTPS JWKS endpoint. Self-asserted staged headers are not considered in OIDC mode. OIDC bearer tokens
are accepted only from the Authorization header; the web broker proxies cookie-authenticated SSE and
adds the Authorization header upstream so bearer tokens never appear in URLs.
