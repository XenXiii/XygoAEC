# Email delivery and monitoring operations

## Proven scope

This slice implements durable email-delivery records, a Resend HTTPS adapter, a persistent local
development sink, signature-verified delivery webhooks, and dependency readiness/metrics. It does
not create a Resend account, verify a sending domain, install DNS records, configure a telemetry
backend, create alert rules, deploy any process, or send a live message.

PostgreSQL migration `0006_email_monitoring` creates `email_deliveries`,
`email_webhook_events`, and `service_heartbeats`; `0007_email_suppressions` adds durable,
tenant-scoped normalized-recipient suppression records. Email content and recipient addresses stay in the
tenant-scoped delivery record; the outbox payload contains only the delivery id and kind.

Implemented enqueue paths are:

- a managed-IdP identity binding queues one activation message for the newly bound user;
- approving a field report queues one report-ready message for each active in-tenant
  `client_owner` or `client_viewer`;
- the shared `queueEmailDelivery` helper supports a structured `portal_update` message when a
  portal update flow deliberately calls it.

There is no automatic portal-update producer yet. Do not describe portal-update notification as a
live client feature until a product flow invokes it and its recipient policy is approved.

## Delivery guarantees and states

The application inserts the delivery record, `email.delivery.queued` audit evidence, and
`email.delivery.requested` outbox job in one PostgreSQL transaction. The worker claims the durable
job, marks the record `sending`, calls the provider, and atomically persists `accepted` plus audit
evidence. Provider callbacks can move it to `delivered`, `delayed`, `failed`, `bounced`,
`complained`, or `suppressed` and append tenant audit evidence.

Verified bounce, complaint, provider-suppression, and unsubscribe-style callbacks upsert one durable
suppression per tenant and normalized recipient. The record retains its reason, source, provider event
and message ids, originating delivery and resource context, and timestamps. Before every provider call,
the worker checks this registry. Future deliveries to that tenant-recipient pair are finalized as
`suppressed` with audit evidence and the outbox job completes without calling the provider or retrying.
Repeated webhook ids are no-ops, and later suppression callbacks update the existing record rather than
creating duplicates.

Processing is at least once. The durable delivery idempotency key is reused for every retry and is
sent as Resend's `Idempotency-Key`. A worker replay of an already accepted record does not call the
provider again. The local sink also enforces the key and persists inspectable JSON at
`XYGO_EMAIL_SINK_PATH` (default `infrastructure/staged-data/email-sink.json`) without external
network delivery.

Resend's provider-side idempotency retention is finite. A crash before application acceptance is
recorded may require a provider call on retry; alert on stale `sending` records and investigate
before manually replaying a job older than the provider's documented retention window.

## Required private configuration

Use the secret manager and `config/production.env.example` as the non-deployable manifest. API and
worker production validation require:

- `XYGO_EMAIL_TRANSPORT=resend`
- `XYGO_EMAIL_FROM` and `XYGO_EMAIL_REPLY_TO` on approved, non-placeholder domains
- `XYGO_EMAIL_RESEND_API_URL=https://api.resend.com`
- private `XYGO_EMAIL_RESEND_API_KEY` (`re_` format) and `XYGO_EMAIL_WEBHOOK_SECRET`
  (`whsec_` format)
- bounded `XYGO_EMAIL_REQUEST_TIMEOUT_MS`
- `XYGO_MONITORING_ENABLED=true`, a private `XYGO_MONITORING_AUTH_TOKEN`, and an HTTPS
  `XYGO_MONITORING_OTLP_ENDPOINT`
- bounded outbox backlog/age, email failure/staleness, database latency, and worker-heartbeat alert
  thresholds from the production manifest.

These server-only values are excluded from `/runtime-config.json`. The application exposes only the
public browser monitoring endpoint from the web allowlist. The OTLP endpoint/token are validated
configuration surfaces; this slice does not export telemetry to them, so a collector/exporter and
provider-side alert rules remain staging blockers.

## Staging provider setup

1. Create a least-privilege Resend API key in the staging provider account and store it in the
   approved secret manager. Never put it in the repository or browser runtime config.
2. Add and verify the exact staging sending domain. Publish provider-supplied SPF and DKIM records;
   publish an appropriate DMARC policy and validate alignment for the configured From domain.
3. Configure `XYGO_EMAIL_FROM` and `XYGO_EMAIL_REPLY_TO` only after the provider reports the domain
   verified. Keep production and staging domains/keys separate.
4. Register `POST https://<staging-api>/webhooks/email` and subscribe to sent, delivered,
   delivery-delayed, failed, bounced, complained, suppressed, and unsubscribe-style events supported
   by the provider. Store the webhook signing secret privately.
5. The ingress must preserve the raw request body and the `svix-id`, `svix-timestamp`, and
   `svix-signature` headers. The application rejects invalid signatures and events outside its
   five-minute replay window; repeated webhook ids are idempotent.
6. Configure a metrics scraper for `GET /metrics` and a readiness probe for `GET /ready`. Restrict
   metrics exposure at the ingress/network boundary even though metrics contain no recipient
   addresses or message bodies.
7. Create provider-side or monitoring-backend alerts for every threshold below. Merely setting env
   values does not create those external alerts.

## Deploy and smoke sequence

1. Take the managed-Postgres pre-deploy backup and record its recovery point.
2. Run `npm run migrate:postgres` as the separate migration job. Do not let API/worker boot apply
   migrations. Run `npm run check:postgres` and confirm `0006_email_monitoring` and
   `0007_email_suppressions` are applied.
3. Boot one worker and require its startup readiness to pass before scaling it. Boot the API and
   require `/ready` HTTP 200 before routing traffic.
4. Confirm `/ready` reports components named `database`, `storage`, `outbox`, `worker`, and
   `emailDelivery`. Confirm `/metrics` exposes `xygo_dependency_ready`, `xygo_outbox_backlog`, and
   `xygo_email_delivery_failures` without recipient data.
5. With an explicitly approved staging test inbox, bind a test identity and approve a test report.
   Confirm exactly one delivery/outbox job per recipient and idempotency key, one provider message,
   `accepted` then `delivered`, and matching tenant audit events. Automated tests use the local sink
   or a mocked HTTP response and never send real email.
6. Trigger an approved test bounce/complaint or signed fixture, then queue another message to the same
   normalized recipient. Confirm the provider is not called, the new delivery is `suppressed`, the outbox
   job completes, and audit/suppression records are inspectable. Repeat the webhook and confirm no duplicate.
7. Repeat the enqueue/retry smoke once and prove the provider message id remains stable. Use a second
   tenant to prove its delivery list and audit chain cannot see the first tenant's records.

## Alert thresholds and readiness

Production readiness fails closed for an unavailable database/storage/outbox, an absent or stale
worker heartbeat, excessive dead jobs, an outbox backlog above `XYGO_ALERT_OUTBOX_BACKLOG_MAX`, an
oldest pending job beyond `XYGO_ALERT_OUTBOX_OLDEST_PENDING_SEC`, delivery failures above
`XYGO_ALERT_EMAIL_FAILED_MAX`, stale email work beyond `XYGO_ALERT_EMAIL_STALE_SEC`, or database
latency above `XYGO_ALERT_DATABASE_LATENCY_MS`. `XYGO_ALERT_WORKER_HEARTBEAT_SEC` bounds heartbeat
staleness.

`GET /health` is liveness only. `GET /ready` is the dependency gate. `GET /metrics` is the scrape
surface. A green liveness response must never be used as permission to route traffic.
Intentional worker-side suppression skips remain visible in delivery counts and audit evidence but do
not increment the delivery-failure readiness metric; the originating bounce or complaint remains visible.

## Bounce, complaint, failure, and replay

- For a transient outbox/provider failure, inspect the tenant-scoped delivery and outbox job. Let
  bounded retry/backoff run before intervening.
- For a dead job, record the incident and root cause, correct the dependency or configuration, then
  use the tenant-scoped replay procedure in `durable-worker-outbox-runbook.md`. Never change its
  idempotency key.
- For a bounce, complaint, unsubscribe, or provider suppression, stop manual replay, verify the address
  and provider event, and involve the account owner. Future sends for the same tenant and normalized
  recipient are durably suppressed. Removal or override is intentionally not automated: release requires
  an approved operational review, address-owner confirmation, and a separately audited administrative path.
- Unknown but valid webhook event types receive an accepted/ignored response. A tracked event whose
  provider id does not yet match a canonical record receives HTTP 503 so the provider retries; if it
  never reconciles, investigate it using provider logs as an incident.
- Do not edit email or audit rows by hand. Preserve the outbox job, provider event id, delivery id,
  tenant id, timestamps, release SHA, and provider incident reference.

## Incident response and rollback

If provider sending is unsafe, stop workers first so API transactions can continue recording durable
jobs without external delivery. Keep the API only if the bounded backlog/age thresholds and incident
plan allow it; otherwise fail readiness and remove traffic. Rotate a compromised API or webhook key,
update the secret manager, restart affected processes, and verify old webhook signatures fail.

Application rollback must remain schema-compatible with migrations `0006_email_monitoring` and
`0007_email_suppressions`. Do not
drop delivery, webhook, heartbeat, outbox, or audit tables during an incident. Roll back the release,
keep workers stopped, run database/readiness checks, and then resume one worker after confirming the
old release understands queued event types. A destructive schema rollback requires a separately
reviewed migration and restore plan.

Database backups cover delivery status and audit linkage. Provider delivery history and DNS records
are separate operational evidence: export or retain them according to the approved retention policy
and test their reconciliation during the managed-Postgres restore drill.
