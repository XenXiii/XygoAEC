# Xygo AEC — Prototype Review Guide (Private, Staged)

This is a **staged, non-production** prototype: synthetic tenants and data, mock-only
integrations, no live providers or production writes. It is safe to run and click around
locally for private testing/review.

> Every screen shows **SIMULATED DATA**. Do not enter real project, financial, or personal data.

## Requirements

- **Node.js 24+** (the SQLite default backend uses the built-in `node:sqlite`).
- No install needed for the core prototype — **zero third-party dependencies**. (`pg` is only
  needed for the optional Postgres backend and is not required for review.)

## Run it (one command)

```bash
npm start
```

This launches the API, web UI, and background worker together. Then open:

- **Web dashboard:** http://127.0.0.1:4173
- **API health/ready/metrics:** http://127.0.0.1:3000/health · `/ready` · `/metrics`

Stop everything with **Ctrl-C**.

Prefer separate terminals? `npm run start:api`, `npm run start:web`, `npm run start:worker`.

## What to try

1. Open http://127.0.0.1:4173. The **API base URL** is pre-filled (`http://127.0.0.1:3000`).
2. Pick a tenant: **Commercial Simulation** (`tenant-commercial-sim`) or **Residential
   Simulation** (`tenant-residential-sim`), then load the workspace.
3. Walk the surfaces:
   - **Control Room** (`/`) — executive summary + workflow boards (projects, issues, RFIs,
     permits, review sessions, AI findings) with a live SSE indicator.
   - **Blueprinting** (`/blueprint.html`) — staged blueprint workspace: packages, sheets, review
     runs, and AI findings with human disposition.
   - **Preview** (`/demo.html`) — product microsite/preview.
4. Switch tenants to see tenant isolation — each tenant only sees its own synthetic data.

## How the trust model works (important for review)

- Auth is **staged/self-asserted**: the web sends an `x-staged-tenant-id` header; access is granted
  when it matches the tenant in the URL. **There is no login — this is not production auth.**
- Real authentication exists behind a flag: set `XYGO_AUTH_MODE=oidc` (+ `XYGO_OIDC_ISSUER`,
  `XYGO_OIDC_AUDIENCE`) to require verified JWTs. Staged mode is the default for review.
- The server **refuses to boot** in an unsafe config (e.g. `STAGED_MODE=false` without OIDC).

## Optional configuration

| Env var | Effect |
| --- | --- |
| `XYGO_API_REPOSITORY_MODE` | `sqlite` (default) · `file` · `memory` · `postgres` |
| `XYGO_API_DB_PATH` / `XYGO_API_DATA_PATH` | sqlite / file store locations |
| `XYGO_API_PG_URL` | Postgres connection (with `…MODE=postgres`) |
| `XYGO_AUDIT_SIGNING_KEY` | Enables tamper-**proof** (HMAC-signed) audit chain |
| `XYGO_RATE_LIMIT_MAX` / `_WINDOW_MS` | Rate limit tuning |
| `XYGO_MAX_BODY_BYTES` / `XYGO_REQUEST_TIMEOUT_MS` | Request bounds |
| `PORT` / `WEB_PORT` | API / web ports |

Reset the local staged data anytime by deleting `infrastructure/staged-data/api-store.*`
(regenerated from seed on next start), or run with `XYGO_API_REPOSITORY_MODE=memory` for a
clean in-memory session.

## Verify the build

```bash
npm test            # full suite (213 tests; 1 Postgres test skips without XYGO_TEST_PG_URL)
npm run verify:audit
```

## Poke the API directly

```bash
# staged tenant header stands in for auth
curl -s http://127.0.0.1:3000/health
curl -s -H "x-staged-tenant-id: tenant-commercial-sim" \
  "http://127.0.0.1:3000/v1/tenants/tenant-commercial-sim/projects?limit=5"
curl -s -H "x-staged-tenant-id: tenant-commercial-sim" \
  http://127.0.0.1:3000/v1/tenants/tenant-commercial-sim/blueprint-workspace
curl -s http://127.0.0.1:3000/metrics
```

## Known limitations (deliberately not production)

This is a hardened prototype, not a finished product. See
`docs/audit/phase-0-production-readiness-audit.md` for the full readiness scorecard. Notably still
open: distributed tracing/dashboards/alerting, cross-process durable outbox, secret management,
multi-instance rate-limit/idempotency (Redis), a real AI model runtime (the "AI review" is
deterministic simulation), and OpenAPI response-schema validation. Integrations remain
sandbox/simulated by design.
