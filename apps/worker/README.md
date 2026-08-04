# apps/worker

The worker drains the shared durable outbox. Local development defaults to a WAL-enabled SQLite
outbox so separate API and worker processes share jobs without an external queue. Production requires
the PostgreSQL backend and migration `0005_durable_outbox`.

Run locally with `npm run start:worker`. Check queue health with `npm run check:outbox`. This slice
dispatches internal domain-event log records only; it does not configure SMTP, object processing,
malware scanning, monitoring providers, or other external delivery adapters.

See `docs/operations/durable-worker-outbox-runbook.md` for staging configuration, retry/dead-letter
handling, tenant-scoped inspection, replay, graceful shutdown, rollback, and smoke tests.
