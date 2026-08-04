# apps/worker

The worker drains the shared durable outbox. Local development defaults to a WAL-enabled SQLite
outbox so separate API and worker processes share jobs without an external queue. Production requires
the PostgreSQL backend and migration `0005_durable_outbox`.

Run locally with `npm run start:worker`. Check queue health with `npm run check:outbox`. Email jobs
use an inspectable local sink by default. Production requires the configured Resend HTTPS adapter;
tests use the sink or a mocked HTTP response and never send real email. Other domain events retain
the local structured-log handler.

See `docs/operations/durable-worker-outbox-runbook.md` for staging configuration, retry/dead-letter
handling, tenant-scoped inspection, replay, graceful shutdown, rollback, and smoke tests.
See `docs/operations/email-monitoring-runbook.md` for sending-domain checks, webhook verification,
email status/audit evidence, monitoring thresholds, failure handling, and staging smoke tests.
