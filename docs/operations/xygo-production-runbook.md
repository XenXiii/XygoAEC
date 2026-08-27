# Xygo production runbook

## Release gate

1. Run `npm ci`, `npm test`, mobile typecheck/export, browser verification, and the PostgreSQL conformance suite with a dedicated disposable `XYGO_TEST_PG_URL`.
2. Run `node scripts/verify-production-config.mjs` in the deployment environment. Never print secret values.
3. Apply migrations through `0005_billing_entitlements.sql`; take a database snapshot first and verify migration history afterward.
4. Exercise Auth0 signup/login/logout, workspace creation/switching, Stripe test checkout/webhook/cancel, Resend flows, privacy requests, and one provider sync in Preview.
5. Review `npm audit`; release requires zero high/critical findings or an approved time-bounded exception.
6. Deploy the reviewed Xygo-only commit. Confirm `/health`, `/ready`, public pages, `/app`, API auth denial, and monitoring within ten minutes.

## Monitoring and alerting

Collect request rate/latency/status, rate-limit count, authentication failures, database pool saturation, webhook verification failures, duplicate events, sync failures, queue backlog, model timeouts, and entitlement transitions. Alert on readiness failure, five-minute 5xx rate above 2%, p95 latency above two seconds, any cross-tenant-denial regression, webhook failures above three in ten minutes, or backup failure.

Logs must include request/event identifiers but exclude tokens, secrets, raw personal data, full prompts, and Stripe payloads.

## Backups and recovery

- Automated encrypted PostgreSQL backups: daily full plus point-in-time recovery, retained 35 days in a separate account/region.
- Quarterly restore drill into an isolated environment. Validate tenant counts, encrypted-field readability, migration version, audit chains, and entitlement rows.
- Recovery targets: RPO 15 minutes and RTO 4 hours. Record actual drill results and owner sign-off.
- Roll back application code to the prior immutable release. Do not reverse a migration destructively; ship a forward repair migration.

## Incident actions

Contain by disabling affected integration or checkout routes, rotate exposed keys, preserve logs, notify the incident owner, and document scope/timeline. For suspected tenant leakage, stop writes and external sends immediately, preserve evidence, and start the privacy/legal notification assessment.

## External owner actions before release

Provide a dedicated PostgreSQL test URL, Auth0 tenant/application values, Stripe verified live account and webhook endpoint, integration OAuth applications, monitoring/backup destinations, EAS/Apple/Google signing access, and written mobile billing-policy approval.
