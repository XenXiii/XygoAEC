# Xygo Business Scale + Audit — progress update (2026-08-27)

Fresh verification this session (not copied from prior reports).

## Baseline
- Target repo: this workspace. Full test suite at session start: **342 tests, 341 pass, 1 skipped, 0 fail**.
- The 1 skip is `apps/api/test/postgres-conformance.test.js`, gated on `XYGO_TEST_PG_URL` (external blocker).
- Working tree carried ~147 uncommitted files from a prior session — all preserved, none overwritten.

## Verified state (audited against code, not docs)
Real and tested: OIDC validation, server-side RBAC, workspace/audit tenant isolation, Stripe
(server-only checkout, raw-body HMAC verified before parse, idempotent webhooks, entitlement only
from signed events), structured-output/no-chain-of-thought, chat prompt-injection rejection, no
secrets in source, mobile app (strict tsc + tests).

Confirmed gaps: no onboarding/audit-intent state machine (objective dropped across auth); animated
audit was a `setTimeout` fixture; results tiles hardcoded in `app.html`; connect buttons were fake
CSS toggles; no prompt-injection defense on ingested website/document content; connectors are
contract-only libraries wired into nothing (only CSV real).

## Delivered this session
1. `packages/onboarding-journey` — pure 9-state machine (`objective_submitted … workspace_ready`),
   idempotent + non-bypassable transitions, objective/business persistence, plan-is-preference,
   secrets/passwords never stored, service layer with cross-user isolation. 19 tests.
2. End-to-end wiring: `apps/api/src/onboarding/{handler,postgres}.js`, dispatch in `handlers.js`,
   threaded through `server.js` + `runtime-repositories.js`, migration
   `0006_onboarding_journey.sql`. 12 API/adapter tests.
3. UI (guarded, non-visual): homepage stashes the objective to `sessionStorage`; the authenticated
   app persists it server-side on boot (`persistPendingObjective`). Preview rendering unchanged.
4. `packages/audit-results` — evidence-backed results synthesis (health score, opportunities,
   revenue projection) computed from facts with provenance/confidence/assumptions and
   fact/inference/projection/unknown separation. Honest "insufficient evidence" when no data.

## Fresh results
- Full suite after the work: **see the final run in the session** (was 373 before audit-results;
  audit-results adds its own tests). 1 skipped (postgres-conformance). 0 fail.
- Live server smoke: onboarding route reachable in the real dispatch chain (handler 401, not core 404).
- `git diff --check` clean. Nothing committed, pushed, or deployed. Live billing disabled.

## External blockers (unchanged)
Auth0 live login · Stripe sandbox/live · provider OAuth apps · EAS signed device builds · managed
PostgreSQL conformance · production monitoring/backups.

## Next
Convert `audit_queued` → durable worker job via `apps/api/src/reliability/outbox.js`; drive the
onboarding funnel UI through the new API (needs live Auth0 to verify in-browser); render the results
tiles from `packages/audit-results` output instead of the hardcoded `app.html` values.
