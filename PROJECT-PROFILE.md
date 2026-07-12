# Xygo AI AEC OS — Project Profile

_A consolidated profile of the whole project, current as of the full-stack review
hardening pass (2026-07-11)._

- **Repository:** https://github.com/XenXiii/XygoAEC
- **Package name:** `xygo-ai-aec-os` · **version** `0.0.0-phase0`
- **Runtime:** Node.js (ESM, `"type": "module"`), npm workspaces; SQLite via the built-in
  `node:sqlite` module (no third-party dependencies)
- **Status:** **Staged, non-production.** Synthetic tenants/data, mock-only integrations, no live
  providers, no production write paths.
- **Test suite:** **170 passing, 0 failing.** `npm run verify:audit` reports a valid chain.

---

## 1. What This Is

Xygo AI AEC OS is a staged internal corporate / AEC (Architecture, Engineering, Construction)
operating platform, built as a **modular monolith** (see `docs/adr/0001-modular-monolith-baseline.md`).
It models the workflows of a design/construction firm — projects, coordination issues, RFIs,
permit packages, review sessions, AI-assisted design review, dashboards, and a tamper-evident
audit trail — behind a tenant-scoped staged API and a browser dashboard.

Everything runs locally against synthetic data. Staged mode is enforced server-side and cannot
be disabled (`packages/staged-mode`).

## 2. Guardrails (non-negotiable)

- Staged mode only; no live deployment; no production credentials.
- No live Autodesk / Revit / AutoCAD / Rhino / Procore / Trimble / Microsoft / QuickBooks
  connections.
- No production financial writes, no real user traffic, no external write side effects.
- Integrations are mock-only by design.

## 3. Architecture

### Applications (`apps/`)

| App | Role |
| --- | --- |
| `api` | Staged HTTP API — routing, tenant scoping, repositories, SSE realtime, audit append. |
| `web` | Static browser runtime — tenant dashboard, workflow boards, live indicator. |
| `worker` | Placeholder for background/outbox processing (README only). |
| `docs-site` | Placeholder for documentation site (README only). |

### Domain packages (`packages/`) — 22 modules

`staged-mode`, `shared-contracts`, `auth`, `authorization`, `audit`, `communication`,
`projects`, `documents`, `drawings`, `models`, `coordination`, `permits`, `construction`,
`knowledge`, `ai-review`, `integrations`, `dashboards`, `finance-contracts`, `observability`,
`test-fixtures`.

Each package owns its contracts + validation and ships with a test suite. The API composes these
(e.g. `coordination`, `ai-review`, `permits`, `dashboards`, `audit`) rather than re-implementing
domain rules. Domain map: `docs/architecture/domain-map.md`.

## 4. API Surface

Base: `http://127.0.0.1:3000` · all tenant routes under `/v1/tenants/{tenantId}/…`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Staged liveness (public). |
| GET/POST | `/v1/tenants/{t}/projects` | List / create projects. |
| GET/POST | `/v1/tenants/{t}/issues` | List / create coordination issues. |
| GET/POST | `/v1/tenants/{t}/rfis` | List / create RFIs. |
| GET/POST | `/v1/tenants/{t}/permits` | List / create permit packages. |
| GET/POST | `/v1/tenants/{t}/review-sessions` | List / create review sessions. |
| GET/POST | `/v1/tenants/{t}/ai-review-runs` | List / create AI review runs. |
| GET/POST | `/v1/tenants/{t}/ai-findings` | List / create AI findings. |
| POST | `/v1/tenants/{t}/ai-findings/{id}/disposition` | Update human disposition (optionally convert to issue). |
| GET | `/v1/tenants/{t}/dashboard/executive` | Executive portfolio summary. |
| GET | `/v1/tenants/{t}/audit-events` | Tenant audit event history. |
| GET | `/v1/tenants/{t}/audit-events/verify` | Verify the tenant audit chain. |
| GET | `/v1/tenants/{t}/transfers` | Staged transfer queue. |
| GET | `/v1/tenants/{t}/events/stream` | SSE snapshot + heartbeat stream. |

Contract: `docs/api/openapi.v1.json` (OpenAPI 3.1). Collection create/list endpoints are
table-driven from a single `collectionResources` config in `apps/api/src/handlers.js`.

## 5. Persistence

Three interchangeable repository backends behind one contract
(`apps/api/src/repositories/`):

- `sqlite` — **default**; `node:sqlite`, migration `infrastructure/migrations/0001_staged_api.sql`,
  DB at `infrastructure/staged-data/api-store.sqlite`.
- `file` — JSON document store with **atomic** temp-file + `rename` writes.
- `memory` — in-process Map store.

All three are seeded from `packages/test-fixtures` synthetic tenants and are held to one behavior
contract by `apps/api/test/repository-conformance.test.js` (per-backend suite + cross-backend
equivalence).

Env controls: `XYGO_API_REPOSITORY_MODE=sqlite|file|memory`, `XYGO_API_DB_PATH`,
`XYGO_API_DATA_PATH`.

## 6. Realtime, Audit, Security Posture

- **Realtime:** SSE stream emits a `snapshot` then periodic `heartbeat` counts per tenant
  (`apps/api/src/realtime.js`).
- **Audit:** per-tenant SHA-256 hash chain (`packages/audit`). Events are appended on every
  write; `…/audit-events/verify` recomputes the chain. Hashing is order-independent and covers
  nested content. **Tamper-evident, not tamper-proof** (no signing key — activation-phase item).
- **Tenant scope:** enforced at one point (`apps/api/src/staged-auth.js`). **Self-asserted and
  unauthenticated by design** — access is granted when `x-staged-tenant-id` (or `stagedTenantId`
  query param for SSE) matches the path tenant. Documented in
  `docs/security/staged-mode-policy.md`; gated by `apps/api/test/staged-auth.test.js` against the
  activation checklist. **Must be replaced with real authn/authz before activation.**

## 7. Web Runtime

Static server (`apps/web/src/server.js`) serving `public/` + `src/`. The dashboard
(`public/app.js`) renders tenant summary cards and workflow boards, fetches over the API with the
tenant header, and subscribes to the SSE stream. Rendering uses `textContent`/DOM construction
(no `innerHTML`), so record content cannot inject markup. Accessibility affordances (skip nav,
focus styles, reduced-motion) are present and tested (`apps/web/test/accessibility.test.js`).

Base: `http://127.0.0.1:4173`.

## 8. Testing

`node --test` across all workspaces — **170 tests, 0 failing**. Suites cover every domain package
plus API routing, repository persistence, repository conformance, staged auth / activation gate,
audit chaining/tamper, realtime, view-models, and accessibility.

```bash
npm test                                    # full suite (170)
npm run test:api                            # API app tests
npm run test:web                            # web app tests
npm run test:foundation                     # shared-contracts/auth/authorization/audit
npm run test:staged-mode                    # staged-mode policy
npm run verify:audit                        # audit-chain verification demo
node --test apps/api/test/repository.test.js # repository persistence
```

## 9. How to Run

```bash
# API (defaults to sqlite)
node apps/api/src/server.js            # http://127.0.0.1:3000

# Web
node apps/web/src/server.js            # http://127.0.0.1:4173

# Alternate backends
XYGO_API_REPOSITORY_MODE=memory node apps/api/src/server.js
XYGO_API_REPOSITORY_MODE=file   node apps/api/src/server.js
```

## 10. Documentation Map (`docs/`)

- **Architecture:** `adr/0001-modular-monolith-baseline.md`, `architecture/domain-map.md`,
  phase notes 1–8, `phased-implementation-backlog.md`, `requirements-traceability-matrix.md`,
  `agent-responsibility-matrix.md`.
- **API:** `api/openapi.v1.json`, `api/staged-provider-contracts.md`.
- **Security:** `security/staged-mode-policy.md`, `security/threat-model.md`, per-phase security
  notes 0–7, `security/phase-1-authorization-model.md`.
- **Data dictionary:** `data-dictionary/phase-1…7`.
- **Operations:** `operations/risk-register.md`, `operations/staged-deployment-report.md`,
  `operations/staged-demo-scenarios.md`.
- **Testing:** `testing/phase-0-test-strategy.md`, `testing/accessibility-baseline.md`,
  `testing/load-test-plan.md`.
- **Activation:** `activation/activation-checklist.md`.
- **Review:** `projects/xygo-aec-claude-fullstack-review-results.md`, `CHANGELOG.md`.

## 11. Full-Stack Review Hardening Pass (2026-07-11)

Findings fixed in place (staged-safe). Suite grew **131 → 170**.

| Area | Change |
| --- | --- |
| DoS (HIGH) | Malformed request body no longer crashes the API — error boundary in `handleApiRequest` + server lifecycle guard (400/500). |
| XSS (HIGH) | Dashboard board cards render via `textContent`/DOM instead of `innerHTML`. |
| Tenant auth (HIGH, by design) | Unified to `staged-auth.js`; documented + activation-gate test tied to the checklist. |
| Audit integrity | Recursive canonical hashing so nested state-ref content is covered; +tamper/chain tests (flat-event hashes unchanged). |
| File durability | Atomic temp-file + `rename` writes; no torn stores. |
| API contract | OpenAPI security schemes + global security (header for REST, query for SSE); `/health` public. |
| Maintainability | Seven duplicated route ladders collapsed into a table-driven dispatcher. |
| Consistency | New repository conformance harness across memory/file/sqlite. |

Full detail: `projects/xygo-aec-claude-fullstack-review-results.md`.

## 12. Roadmap — Deferred to Activation Phase

Out of staged scope; required before any production activation:

1. **Real tenant authn/authz** to replace the self-asserted staged model (gated by
   `apps/api/test/staged-auth.test.js` + the activation checklist).
2. **Keyed MAC / signature** for audit events (tamper-*proofing*, not just tamper-evidence).
3. **Multi-process write safety** for the file backend (locking), or standardize on `sqlite`.
4. Complete the activation checklist (`docs/activation/activation-checklist.md`): vendor terms,
   production OAuth, DPAs, pen testing, tenant-isolation verification, monitoring/alerting,
   external-write kill switch, rollback plan, readiness review.

## 13. Git / Publish State

- Remote: `origin` → `https://github.com/XenXiii/XygoAEC.git` (clean URL; no token in config).
- Commits: `57691a3` (initial staged build + review hardening, 126 files),
  `4288eed` (CHANGELOG). Local `main` == remote `main`.
- `.gitignore` excludes runtime stores (`infrastructure/staged-data/api-store.*`), `.openclaw/`,
  `node_modules/`, temp/log files; keeps `infrastructure/staged-data/.gitkeep`.
