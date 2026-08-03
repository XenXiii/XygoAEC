# Canonical Postgres Provisioning

Paid-client staging provisioning writes only to the application Postgres repository. The command no
longer creates a separate JSON store. It remains staged-only and does not create identity-provider
accounts or enable production authentication.

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
npm run test:postgres
```

An unset `XYGO_TEST_PG_URL` causes the Postgres tests to skip explicitly. A release gate must provide
the variable and require the tests to execute rather than accept a skip.

The GitHub Actions Postgres job supplies both URLs only to its disposable Postgres 16 service job,
sets `XYGO_REQUIRE_PG_TESTS=true`, applies migrations twice, and then runs `npm run test:postgres`.
Required mode exits with an error if `XYGO_TEST_PG_URL` is absent, so that job cannot pass by skip.

## Migrations

The Postgres repository applies ordered SQL migrations at connection startup and records them in
`schema_migrations`:

1. `0001_init.sql`
2. `0002_paid_client_provisioning.sql`

The second migration adds canonical users, paid-client role assignments, business profiles, portal
configuration, portal seed data, and provisioning events. Provisioning also uses the existing
projects, platform-blueprints, tenants, and audit-event tables.

The conformance suite checks the actual table names, recorded migration versions, canonical
repository reads, cross-tenant project/user separation, portal branding/update separation,
idempotency, conflict rejection, audit records, and full rollback after a forced error.

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
