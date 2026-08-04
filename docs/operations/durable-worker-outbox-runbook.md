# Durable Worker and Outbox Operations Runbook

This runbook defines the staging/production contract for Xygo background-job durability. Migration
`0005_durable_outbox` adds the PostgreSQL `outbox_jobs` table. The API writes canonical domain state,
audit evidence, and its outbox event in one PostgreSQL transaction for the collection create flows
field-report draft/review transitions, and file upload/delete finalization paths wired by this slice.

This work does not provision PostgreSQL, deploy a worker, install live credentials, send email,
configure a monitoring provider, process malware, or perform external delivery. The current handler
records internal domain-event delivery only. Provider integrations require separate approval and
must preserve the outbox idempotency key.

## Runtime model and invariants

- Production and staging use `XYGO_OUTBOX_BACKEND=postgres`. API and worker processes connect to the
  same migrated PostgreSQL database. Normal application startup never applies migrations.
- Local development defaults to a WAL-enabled SQLite file at
  `infrastructure/staged-data/outbox.sqlite`; API and worker processes can share it without an
  external queue. `memory` remains available for isolated tests only.
- Enqueue uses a unique deterministic idempotency key. Repeating the same app operation returns the
  existing job instead of creating a duplicate.
- Workers claim with `FOR UPDATE SKIP LOCKED`; only the owning worker may complete or fail a claim.
  A claim left by a crashed worker becomes eligible after `XYGO_WORKER_STALE_AFTER_MS` and increments
  the attempt counter when reclaimed.
- Delivery is at least once. A crash after an external side effect but before job completion can
  cause redelivery. Every future provider request must use `event.idempotencyKey` as its provider-side
  idempotency key or equivalent duplicate guard.
- Inspection and replay require both job ID and canonical tenant ID. There is no global payload-list
  command, preventing an operator typo from mixing tenant job data.

## Required production worker settings

- `XYGO_OUTBOX_BACKEND=postgres`
- `XYGO_API_PG_URL` and the bounded `XYGO_PG_*` pool settings from the managed PostgreSQL runbook
- `XYGO_WORKER_INTERVAL_MS`: poll interval, 100–60000
- `XYGO_WORKER_CONCURRENCY`: jobs claimed per tick, 1–64
- `XYGO_WORKER_MAX_ATTEMPTS`: claim attempts before dead-lettering, 1–20
- `XYGO_WORKER_BASE_BACKOFF_MS`: first retry delay, 100–900000
- `XYGO_WORKER_MAX_BACKOFF_MS`: exponential-backoff cap, 100–86400000 and not below the base
- `XYGO_WORKER_STALE_AFTER_MS`: crashed-claim threshold, 1000–3600000
- `XYGO_WORKER_SHUTDOWN_TIMEOUT_MS`: graceful-drain limit, 1000–120000
- `XYGO_WORKER_MAX_DEAD_JOBS`: maximum dead jobs allowed by readiness, 0–100000; staging starts at 0

The complete production manifest still requires validated audit, email, storage, and monitoring
configuration. Those provider settings are not made live by this runbook.

## Deploy and readiness sequence

1. Back up the managed database and record the restore point according to the managed PostgreSQL
   runbook.
2. Run `npm run migrate:postgres` as the separate deploy migration step. Confirm
   `0005_durable_outbox` appears, then run the command again to prove reapplication is harmless.
3. Run `npm run check:postgres`, then `npm run check:outbox`. The outbox check fails on database/schema
   errors, stale processing claims, or dead-job counts above `XYGO_WORKER_MAX_DEAD_JOBS`.
4. Start one worker replica. Confirm startup reports backend `postgres`, the configured concurrency,
   and a unique worker ID. Do not increase replicas until the single-replica smoke test passes.
5. Start the API. Its `/ready` response includes database, storage, and outbox health; production
   readiness fails closed when outbox health is unsafe.
6. Increase worker replicas within the reviewed PostgreSQL connection budget. Concurrent claims are
   serialized by PostgreSQL row locks and skip already claimed work.

## Retry, dead-letter, and replay operations

On handler failure the worker clears its claim, records a bounded error message, and schedules
`min(maxBackoff, baseBackoff * 2^(attempts-1))`. At `XYGO_WORKER_MAX_ATTEMPTS` the job becomes `dead`
and readiness fails when the allowed dead-job threshold is exceeded.

Inspect one tenant without printing arbitrary payloads:

```sh
npm run outbox:inspect -- --tenant-id tenant-example --status dead
```

Before replay, identify and correct the dependency or code failure, record an incident/change ticket,
and confirm the aggregate remains valid. Replay requires a reason and resets attempts while retaining
the replay count and timestamp:

```sh
npm run outbox:replay -- --tenant-id tenant-example --job-id JOB_ID --reason INCIDENT_OR_CHANGE_ID
```

Re-run `npm run check:outbox` and inspect the same tenant. Never update job status directly unless the
runbook itself is unavailable during an incident; preserve a database snapshot and operator record if
an emergency SQL repair is approved.

## Graceful shutdown and failure handling

- On `SIGTERM` or `SIGINT`, the worker stops polling and waits for its active tick. It exits cleanly
  only after claimed handlers finish, bounded by `XYGO_WORKER_SHUTDOWN_TIMEOUT_MS`.
- A timeout exits non-zero. The remaining `processing` claim is not silently marked successful; it is
  reclaimed after the stale threshold and must rely on the idempotency contract.
- Repeated tick/database errors, growing backlog, stale claims, any dead job above policy, or shutdown
  timeouts block staging approval. Monitoring-provider alert wiring is a later slice; until then the
  deployment owner must run the readiness and tenant inspection commands during smoke tests/incidents.

## Staging smoke test

1. Create a tenant-scoped test record through the authenticated API with a fixed `Idempotency-Key`.
2. Verify exactly one matching `pending` outbox row and its same-tenant audit/domain record.
3. Repeat the request and prove no duplicate domain record or outbox idempotency key is created.
4. Run the worker and verify the job reaches `processed` once.
5. Pause the handler to force a retry; prove no early claim before backoff and a claim after backoff.
6. Force the configured final failure; prove the job becomes `dead`, readiness fails, and the bounded
   error is tenant-scoped and inspectable.
7. Prove inspection/replay with a different tenant returns no job. Replay with the owning tenant,
   recover the handler, and verify `processed` plus an incremented replay count.
8. Terminate a worker with a handler in flight. Prove it drains before exit; separately force a
   shutdown timeout and prove the stale claim is safely reclaimed once.
9. Record migration output, queue counts, timings, worker IDs, tenant-isolation evidence, and rollback
   decision window in the deployment record.

## Rollback

Migration `0005_durable_outbox` is additive. Roll back application/worker code only if the prior
release remains compatible with the forward schema; do not drop `outbox_jobs` during an incident.
Stop API enqueue traffic, gracefully stop workers, capture tenant-scoped pending/failed/dead counts,
and retain all rows. Restore the previous release, then decide whether compatible jobs can remain for
forward recovery or require an approved tenant-scoped replay after redeploy. Database restore follows
the managed PostgreSQL runbook and must not be performed solely to clear failed jobs.
