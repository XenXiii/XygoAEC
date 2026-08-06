# Production Environment And Secrets Gate

This contract runs synchronously before the API, web server, or worker starts when
`NODE_ENV=production` or `STAGED_MODE=false`. Missing, placeholder, or unsafe values throw before the
process listens or starts its work loop. Local and staged developer defaults remain unchanged when
`NODE_ENV` is not `production` and `STAGED_MODE` is not `false`.

Start from [`config/production.env.example`](../../config/production.env.example). It contains names,
reserved example domains, and deliberately invalid placeholders only. The production gate rejects
those values; replace them with reviewed deployment values. Do not copy secrets into the repository,
client bundles, build arguments, logs, or pull-request settings. Inject private values at runtime from
the approved secret manager.

## Required by every deployable staging/production process

- `NODE_ENV=production`
- `STAGED_MODE=false`
- `XYGO_DEPLOY_ENVIRONMENT=staging` or `production`; both use the same fail-closed gate
- `XYGO_RELEASE`: immutable release identifier, normally the deployed commit SHA

The process-specific lists below are exact. A deployment platform may use one environment group, but
the web process should receive only its list. API/worker secrets are not web configuration.

## Web: public values only

- `XYGO_WEB_APP_URL`: canonical HTTPS application origin
- `XYGO_WEB_API_BASE_URL`: canonical HTTPS API origin
- `XYGO_AUTH_MODE=oidc`
- `XYGO_OIDC_PROVIDER`
- `XYGO_OIDC_ISSUER`
- `XYGO_OIDC_AUDIENCE`
- `XYGO_WEB_OIDC_CLIENT_ID`: public-client identifier, not a secret
- `XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT`
- `XYGO_WEB_OIDC_TOKEN_ENDPOINT`
- `XYGO_WEB_OIDC_END_SESSION_ENDPOINT` unless `XYGO_OIDC_PROVIDER=google`
- `XYGO_WEB_OIDC_SCOPES`, including `openid`
- `XYGO_WEB_MONITORING_ENDPOINT`: unauthenticated browser telemetry intake URL

`/runtime-config.json` is built field-by-field from this allowlist. It returns deployment/release,
app/API URLs, the browser monitoring endpoint, and public OIDC/PKCE settings. It never copies the
environment object. `XYGO_WEB_OIDC_CLIENT_SECRET` is allowed only as a server-side web secret for
providers such as Google whose token endpoint requires client authentication; it must never be exposed
to the browser runtime, static assets, logs, or `/runtime-config.json`.

The web login broker additionally requires a private session-signing secret, a `__Host-` Secure and
HttpOnly SameSite=Lax cookie, exact same-origin renewal/logout checks, bounded transaction/session/token
timers, and refresh-token support. Only signed opaque session ids enter cookies; refresh tokens stay
server-side and access tokens are returned with `Cache-Control: no-store` for in-memory browser use.

## API: server-only values

The API requires `XYGO_WEB_APP_URL`, `XYGO_WEB_API_BASE_URL`, `XYGO_AUTH_MODE=oidc`,
`XYGO_OIDC_PROVIDER`, `XYGO_OIDC_ISSUER`, and `XYGO_OIDC_AUDIENCE`, plus:

- `XYGO_API_REPOSITORY_MODE=postgres`
- `XYGO_API_PG_URL`: PostgreSQL URL with `sslmode=require`, `verify-ca`, or `verify-full`
- `XYGO_PG_POOL_MAX`: connections per process, integer from 1 through 50
- `XYGO_PG_IDLE_TIMEOUT_MS`: integer from 1000 through 300000
- `XYGO_PG_CONNECTION_TIMEOUT_MS`: integer from 1000 through 30000
- `XYGO_OIDC_JWKS_URI`: explicit HTTPS JWKS URL
- `XYGO_OIDC_ALLOWED_ALGORITHMS`
- `XYGO_OIDC_CLOCK_TOLERANCE_SEC`: integer from 0 through 300
- `XYGO_AUDIT_SIGNING_KEY`: non-placeholder secret with at least 32 characters
- `XYGO_EMAIL_TRANSPORT=resend`
- `XYGO_EMAIL_FROM`
- `XYGO_EMAIL_REPLY_TO`
- `XYGO_EMAIL_RESEND_API_URL=https://api.resend.com`
- `XYGO_EMAIL_RESEND_API_KEY`: private non-placeholder secret in Resend's `re_` key format
- `XYGO_EMAIL_WEBHOOK_SECRET`: private non-placeholder signing secret in `whsec_` format
- `XYGO_EMAIL_REQUEST_TIMEOUT_MS`: integer from 1000 through 30000
- `XYGO_STORAGE_DRIVER=s3`
- `XYGO_STORAGE_BUCKET`
- `XYGO_STORAGE_REGION`
- `XYGO_STORAGE_ENDPOINT`: HTTPS endpoint
- `XYGO_STORAGE_ACCESS_KEY_ID`
- `XYGO_STORAGE_SECRET_ACCESS_KEY`: non-placeholder secret with at least 16 characters
- `XYGO_STORAGE_FORCE_PATH_STYLE`: `true` or `false` for provider compatibility
- `XYGO_STORAGE_PUBLIC_ACCESS=blocked`
- `XYGO_STORAGE_SERVER_SIDE_ENCRYPTION=AES256`
- `XYGO_STORAGE_MAX_FILE_BYTES`: integer from 1024 through 262144000
- `XYGO_STORAGE_ALLOWED_MIME_TYPES`: explicit comma-separated types without wildcards
- `XYGO_STORAGE_SIGNED_URL_TTL_SEC`: integer from 60 through 900
- `XYGO_STORAGE_RETENTION_DAYS`: integer from 1 through 3650
- `XYGO_OUTBOX_BACKEND=postgres`
- `XYGO_MONITORING_ENABLED=true`
- `XYGO_MONITORING_OTLP_ENDPOINT`: HTTPS server-side telemetry endpoint
- `XYGO_MONITORING_AUTH_TOKEN`: non-placeholder secret with at least 16 characters
- `XYGO_ALERT_OUTBOX_BACKLOG_MAX`: integer from 0 through 1000000
- `XYGO_ALERT_OUTBOX_OLDEST_PENDING_SEC`: integer from 1 through 86400
- `XYGO_ALERT_EMAIL_FAILED_MAX`: integer from 0 through 100000
- `XYGO_ALERT_EMAIL_STALE_SEC`: integer from 60 through 604800
- `XYGO_ALERT_DATABASE_LATENCY_MS`: integer from 50 through 30000
- `XYGO_ALERT_WORKER_HEARTBEAT_SEC`: integer from 5 through 3600

## Worker: server-only values

The worker requires the shared runtime posture, `XYGO_WEB_APP_URL`, Postgres, audit, email, storage,
outbox, and server-side monitoring values above. It additionally requires:

- `XYGO_WORKER_INTERVAL_MS`: integer from 100 through 60000
- `XYGO_WORKER_MAX_ATTEMPTS`: integer from 1 through 20
- `XYGO_WORKER_BASE_BACKOFF_MS`: integer from 100 through 900000
- `XYGO_WORKER_MAX_BACKOFF_MS`: integer from 100 through 86400000 and not below the base backoff
- `XYGO_WORKER_CONCURRENCY`: integer from 1 through 64
- `XYGO_WORKER_STALE_AFTER_MS`: integer from 1000 through 3600000
- `XYGO_WORKER_SHUTDOWN_TIMEOUT_MS`: integer from 1000 through 120000
- `XYGO_WORKER_MAX_DEAD_JOBS`: integer from 0 through 100000

The tenant file-storage slice implements this private S3-compatible configuration, signed access,
PostgreSQL metadata, and local development storage. The bucket, credentials, provider controls,
malware/quarantine workflow, and restore drill are not provisioned by config validation. The durable
PostgreSQL outbox, worker lifecycle, Resend delivery adapter, local email sink, signed webhook path,
and dependency readiness surfaces are implemented, but no live email or monitoring account is
configured. See the [Durable Worker and Outbox Operations Runbook](durable-worker-outbox-runbook.md)
and [Email Delivery and Monitoring Operations Runbook](email-monitoring-runbook.md).

Production URLs, PostgreSQL URLs, and email domains reject IANA-reserved example, test,
and invalid names, local or loopback names, and obvious placeholder labels. This prevents the example
manifest from becoming bootable after only its secret placeholders are replaced.

PostgreSQL migrations are deliberately not an application-startup feature. Run the separate
deployment migration and readiness commands using the procedure in the
[Managed PostgreSQL Operations Runbook](managed-postgres-runbook.md). Production API startup then
performs a read-only database/schema preflight before listening.

## Private values and rotation

The database URL, audit signing key, Resend API/webhook keys, storage access key/secret, server-side
monitoring token, and any future managed-IdP binding administration token are private. They are
explicitly disjoint from the public web allowlist and are covered by a regression test that places a
unique sentinel in every private variable and proves none appears in `/runtime-config.json`.

Rotate private credentials through the secret manager and restart the affected server-side process.
Audit signing-key rotation needs a separate chain-verification procedure before a live environment is
approved; that procedure is not implemented in this slice.

## What this gate does not do

This gate does not configure a live IdP, email account/domain, object-store service, telemetry backend,
managed Postgres database, or worker process. It does not deploy or execute the documented backup, restore,
rollback, or migration procedures against a managed service. Live service configuration,
secret-manager bindings, a successful restore drill, and staging smoke tests remain release blockers.
