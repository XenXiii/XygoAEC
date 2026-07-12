# Xygo AI AEC OS — Phase 0 Production-Readiness Audit

_Code-verified evidence map. No remediation performed (Phase 0 rule). Every claim below is
grounded in repository code, tests, config, or deploy assets — not documentation._

- **Date:** 2026-07-11
- **Repo:** https://github.com/XenXiii/XygoAEC · commit `86a9443`
- **Method:** static read of all entrypoints, packages, migrations, docs, `.github`, deploy assets;
  runtime probes of the API; test suite execution (170 passing).
- **Verdict:** Sophisticated staged **domain prototype**; **not** production-deployable. Several
  capabilities that docs imply exist are **library-only and not wired into the runtime**.

Classification legend: **[IMPL]** implemented & integrated · **[PART]** partially implemented ·
**[DOC]** documented-only · **[PLACE]** placeholder · **[MISS]** missing.

---

## 1. System Inventory

| Item | Evidence | Status |
| --- | --- | --- |
| API entrypoint | `apps/api/src/server.js` (`http.createServer`, port `PORT`\|3000) | [IMPL] |
| Web entrypoint | `apps/web/src/server.js` (static file server, `WEB_PORT`\|4173) | [IMPL] |
| Worker | `apps/worker/` — README only, no code | [PLACE] |
| Docs-site | `apps/docs-site/` — README only, no code | [PLACE] |
| Config knobs | `PORT`, `WEB_PORT`, `XYGO_API_REPOSITORY_MODE`, `XYGO_API_DATA_PATH`, `XYGO_API_DB_PATH`; `STAGED_MODE` read only inside `packages/staged-mode`, **not by any app** | [PART] |
| Persistence | `repositories/{memory,file,sqlite}.js` behind one contract; sqlite default (`node:sqlite`) | [IMPL] |
| Background jobs | none in runtime; `createOutboxEvent` exists in `packages/audit` but is **never consumed** | [MISS] |
| External integrations | `packages/integrations` — all `simulate*` adapters, `staged=true` required, host `example.invalid` | [PLACE] (by design) |
| Dependencies | zero third-party deps; no `node_modules`; sub-packages have no `package.json` (relative imports) | [IMPL] |

## 2. Route Inventory (14 documented, verified against `handlers.js`)

| Route | Writes | Runtime auth | Tenant boundary |
| --- | --- | --- | --- |
| `GET /health` | no | none (public) | none |
| `GET/POST /v1/tenants/{t}/projects` | POST | self-asserted header == path | header==path only |
| `GET/POST …/issues` | POST | same | parent project tenancy checked |
| `GET/POST …/rfis` | POST | same | parent project tenancy checked |
| `GET/POST …/permits` | POST | same | parent project tenancy checked |
| `GET/POST …/review-sessions` | POST | same | parent project tenancy checked |
| `GET/POST …/ai-review-runs` | POST | same | parent project tenancy checked |
| `GET/POST …/ai-findings` | POST | same | parent review-run tenancy checked |
| `POST …/ai-findings/{id}/disposition` | POST | same | finding→run tenancy checked |
| `GET …/dashboard/executive` | no | same | tenant-scoped read |
| `GET …/audit-events` (+ `/verify`) | no | same | tenant-scoped read |
| `GET …/transfers` | no | same | tenant-scoped read |
| `GET …/events/stream` (SSE) | no | self-asserted header **or `?stagedTenantId`** | header/query==path |

**No route requires an authenticated principal.** Write paths validate field presence + parent
tenancy only. No pagination, sorting, filtering, or body-schema validation (presence checks only).

## 3. Auth & Trust-Boundary Map

- **Tenant identity derived from** the caller-supplied `x-staged-tenant-id` header (REST) or
  `stagedTenantId` query param (SSE), single point `apps/api/src/staged-auth.js`. **Self-asserted,
  unauthenticated.** [PART — staged intent, production trust boundary MISSING]
- **User identity:** `x-staged-user-id` header, defaulted to `"synthetic-user"`, used only as an
  audit actor label. Never validated. [MISS]
- **Authorization decision points in runtime:** exactly one — `tenantId == path`. **No RBAC/ABAC.**
- **`packages/authorization`** (`canPerform`, `getPermissionMatrix`, role denial) and
  **`packages/auth`** (`createSyntheticSession`, `assertSessionTenantAccess`) exist and are tested
  but **are not imported by the API**. [IMPL as library / MISS in runtime]
- **`STAGED_MODE` enforcement:** the running API only emits a static `x-xygo-staged-mode: "true"`
  header; it never calls `assertStagedMode`. The "cannot be disabled" guarantee holds only in the
  library's own tests. [DOC at runtime]
- **Cross-tenant risk:** any client can read/write any tenant by asserting its id; SSE additionally
  via query string. Enforcement is cosmetic against a hostile caller.

## 4. Data Model Map

- 8 tables (`0001_staged_api.sql`): `projects, issues, rfis, permit_packages, review_sessions,
  ai_review_runs, ai_findings, audit_events`.
- Every table: `id/event_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, [project_id|review_run_id]
  TEXT, payload TEXT NOT NULL`. The domain object is an **opaque JSON blob** in `payload`.
- **No foreign keys. No secondary indexes** (so `WHERE tenant_id = ?` is a full scan). **No CHECK
  constraints, no uniqueness beyond PK, no NOT NULL on business fields** (they live in the blob).
- **Migration chain:** single file, no versioning table, no down-migrations. [PART]
- **Relational integrity** (issue→project, finding→run, tenant scoping) is enforced **only in app
  code**, not the database. [PART]
- **Backups / restore / retention / archival:** none. [MISS]

## 5. Deployment & CI/CD Map

- **Startup:** `node apps/api/src/server.js`, `node apps/web/src/server.js`. [IMPL]
- **Deploy manifests:** `infrastructure/docker/docker-compose.staged.yml` is a **no-op** (`alpine`
  printing a notice + `sleep infinity`). No Dockerfile, no k8s, no Terraform, no Procfile. [PLACE]
- **CI files:** `.github/` has `CODEOWNERS` + `instructions/repository-rules.md` only. **No
  `workflows/`.** Nothing runs on PR/push. [MISS]
- **Secrets strategy:** none (no secrets exist; none managed). [MISS]
- **Environment separation:** none (single staged mode). [MISS]

## 6. Observability Map

- **Logs:** the runtime prints one startup line; **no request logs, no error logs** (errors are
  swallowed into a 500 JSON body). [MISS]
- **Metrics / tracing / dashboards / alerting / runbooks / SLOs:** none. `packages/observability`
  is three domain helper functions (`createLoadScenario`, `summarizeQueueHealth`,
  `verifyAuditHealth`) — not telemetry. [MISS / mislabeled]
- **Health:** `/health` liveness only; **no readiness/startup probe**. [PART]

## 7. AI Subsystem Map

- **Prompt locations:** none. **Model call sites:** none. No `anthropic`/`openai`/LLM/inference/
  embedding references anywhere. [MISS]
- **Deterministic logic standing in for AI:** `packages/ai-review` — `runDeterministicChecks`
  (`deterministic: true`), `modelVersion: "model-sim-v1"`, `evidenceType: "deterministic_rule"`.
  The "AI review" is rule-based simulation. [PART — simulation only]
- **Eval dataset:** none. **Offline eval pipeline:** none. **Cost tracking:** none. **Model
  routing / abstraction:** none. **RAG / source attribution:** evidence-reference *fields* exist in
  the schema, but no retrieval. [MISS]
- **Human review controls:** `setHumanDisposition` + disposition endpoint — real and tested. [IMPL]
- **Provenance:** findings carry `assumptions`, `missingInformation`, `evidenceReferences`,
  cautionary-language enforcement — structurally present. [PART]

## 8. Blocker Matrix

| # | Issue | Sev | Business impact | Files | Trust/Deploy impact | Recommended fix |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | No real authentication; identity self-asserted | CRIT | Anyone reads/writes any tenant | `staged-auth.js`, `server.js`, `handlers.js`, `realtime.js` | Breaks tenant trust boundary | OIDC/JWT, server-side principal → tenant resolution |
| B2 | Authorization library not wired to runtime | CRIT | No RBAC; any caller does any action | `handlers.js`, `packages/authorization` | No authz enforcement | Enforce `canPerform` per route |
| B3 | `STAGED_MODE` not enforced at runtime | CRIT | Guardrail is cosmetic; live writes not actually blocked by code | `server.js`, `packages/staged-mode` | Deploy safety | Call `assertStagedMode`/outbound policy in request + integration paths |
| B4 | No CI/CD, no scanning | CRIT | Unsafe code merges; no repeatable release | `.github/workflows/*` (missing) | Release safety | Actions: test + CodeQL + dep scan + build gate |
| B5 | Blob DB, no FK/index/constraints | HIGH | Integrity + full-scan perf; no query scaling | `0001_staged_api.sql`, repos | Data integrity + scale | Postgres relational schema + FKs + indexes + migration chain |
| B6 | No backups/restore/retention | HIGH | Data loss unrecoverable | infra (missing) | Data durability | Managed Postgres + PITR + restore drills |
| B7 | No rate limiting / body-size / timeouts | HIGH | Trivial DoS / resource exhaustion | `server.js` | Availability | Reverse-proxy or middleware limits |
| B8 | No structured logging/metrics/tracing | HIGH | Blind in production; cannot diagnose | `server.js`, all handlers | Operability | OTel + structured logs + request id |
| B9 | Audit tamper-evident not tamper-proof | HIGH | Insider can rewrite chain | `packages/audit/foundation.js` | Compliance | Keyed MAC/signature + append-only store |
| B10 | No pagination/filtering on list routes | MED | Unbounded payloads at scale | `handlers.js` | Scale | Cursor pagination + limits |
| B11 | No graceful shutdown/readiness | MED | Dropped requests on deploy | `server.js` | Reliability | SIGTERM drain + `/ready` |
| B12 | No idempotency on writes | MED | Duplicate records on retry | `handlers.js` | Data integrity | Idempotency-Key handling |
| B13 | Worker/outbox absent | MED | No async processing / eventual consistency | `apps/worker`, `packages/audit` | Reliability | Implement outbox consumer |
| B14 | "AI" has no model/eval/provenance runtime | MED (product) | Cannot claim AI review to customers | `packages/ai-review` | AI governance | Model abstraction + eval harness + cost tracking |
| B15 | No secret management / env separation | MED | Cannot hold provider creds safely | infra | Deploy | Secret store + per-env config |
| B16 | Deploy asset is a no-op | LOW | Cannot deploy reproducibly | `docker-compose.staged.yml` | Deploy | Real Dockerfile + compose/k8s |

## Classification Summary

- **CRITICAL blockers (before any customer):** B1, B2, B3, B4.
- **HIGH (before charging customers):** B5, B6, B7, B8, B9.
- **MEDIUM (before enterprise onboarding):** B10, B11, B12, B13, B14, B15.
- **LOW (deferrable):** B16.

---

## Phased Execution Plan

Scores are 0–100, evidence-based. "Gain" = approx. production-readiness points added when the
phase meets its success criteria.

### Phase 1 — Trust Layer  ·  current **8** → target **80**  ·  risk **CRITICAL**
- **Files:** `apps/api/src/server.js`, `apps/api/src/handlers.js`, `apps/api/src/staged-auth.js`
  (→ real `auth/` module), `apps/api/src/realtime.js`, wire `packages/auth` + `packages/authorization`.
- **Changes:** OIDC/JWT verification middleware; derive tenant + roles from validated token
  (delete header trust); per-route `canPerform` checks; security headers; rate limiting; body-size
  + request timeouts; enforce `assertStagedMode` in the write/outbound path; keyed audit MAC.
- **Tests:** cross-tenant denial matrix; authz bypass attempts; token expiry/tamper; rate-limit &
  size-limit; SSE auth parity; convert the activation-gate test to require real auth.
- **Deployment impact:** introduces an IdP dependency + secrets; needs env config.
- **Gain:** +30. **Depends on:** none (do first). **Blocks:** all customer use.

### Phase 2 — Data Layer  ·  current **25** → target **80**  ·  risk **HIGH**
- **Files:** new `infrastructure/migrations/*` (Postgres), new `repositories/postgres.js`, extend
  conformance harness to the PG backend.
- **Changes:** normalized relational schema; FKs (tenant→projects→issues/rfis/…); indexes on
  `tenant_id` + hot lookups; CHECK/enum constraints; ordered migration chain + version table;
  managed backups + PITR; documented restore drill.
- **Tests:** integrity (FK violations rejected), migration up/down, conformance parity vs
  memory/file/sqlite, restore-from-backup rehearsal.
- **Deployment impact:** managed Postgres provisioning.
- **Gain:** +15. **Depends on:** Phase 1 (tenant scoping keys). **Blocks:** scale, compliance.

### Phase 3 — Reliability  ·  current **15** → target **75**  ·  risk **HIGH**
- **Files:** `apps/worker/` (implement), `packages/audit` outbox consumer, `apps/api/src/server.js`.
- **Changes:** outbox pattern + worker; idempotency keys; retry/backoff; graceful SIGTERM drain;
  `/ready` readiness + startup probes; failure-injection tests.
- **Tests:** kill-mid-write → no partial/dup; retry idempotency; drain on shutdown; readiness gating.
- **Deployment impact:** worker process/service added.
- **Gain:** +10. **Depends on:** Phase 2.

### Phase 4 — Operations & Observability  ·  current **8** → target **75**  ·  risk **HIGH**
- **Files:** `server.js`, handlers, new `packages/telemetry`, `docs/operations/runbooks/*`.
- **Changes:** structured JSON logs + request/correlation ids; OpenTelemetry traces + metrics;
  dashboards; alerting; runbooks; SLO/SLI definitions.
- **Tests:** log-shape assertions; trace propagation; metric emission; alert rule validation.
- **Deployment impact:** telemetry backend (OTel collector).
- **Gain:** +8. **Depends on:** Phase 1 (principal in logs), 3 (worker traces).

### Phase 5 — CI/CD & Release Safety  ·  current **2** → target **85**  ·  risk **CRITICAL**
- **Files:** `.github/workflows/{ci,codeql,release}.yml`, branch protection.
- **Changes:** test on PR; CodeQL; dependency scan; build verification; release pipeline + rollback;
  environment promotion rules; block merge on failure.
- **Tests:** the pipeline *is* the test; add a failing-PR fixture to prove gating.
- **Deployment impact:** none runtime; governs delivery.
- **Gain:** +10. **Depends on:** existing test suite (ready). *Can start in parallel with Phase 1.*

### Phase 6 — API Maturity  ·  current **30** → target **80**  ·  risk **MED**
- **Files:** `handlers.js`, `docs/api/openapi.v1.json`, new contract tests.
- **Changes:** request/response schema validation; pagination/filter/sort; versioning; standardized
  error envelope (already partially present); idempotency; full OpenAPI component coverage;
  contract testing.
- **Tests:** schema-violation rejection; pagination correctness; contract tests vs spec.
- **Gain:** +7. **Depends on:** Phase 1, 2.

### Phase 7 — AI Foundation  ·  current **5** → target **70**  ·  risk **MED**
- **Files:** new `packages/ai-runtime` (model abstraction, prompt registry, cost, routing),
  `packages/ai-review` (wire real inference behind the deterministic path), eval datasets + harness.
- **Changes:** provider abstraction (Anthropic-first); prompt registry; offline eval pipeline;
  human-review enforcement (exists); cost tracking; RAG w/ source attribution; governance doc.
- **Tests:** eval thresholds; provenance-required; cost accounting; fallback to deterministic.
- **Deployment impact:** model provider creds (via Phase 1 secret store) — gated staged→prod.
- **Gain:** +6. **Depends on:** Phase 1 (secrets), 4 (cost/latency telemetry).

### Phase 8 — Compliance & Governance  ·  current **15** → target **75**  ·  risk **MED**
- **Files:** `docs/security/*`, `docs/activation/*`, retention/access-review config, DPA templates.
- **Changes:** enforce retention/privacy controls; access-review process; incident ownership;
  pen-test readiness; SOC2/ISO control mapping tied to real enforcement.
- **Tests:** retention job correctness; audit export integrity; access-review evidence.
- **Gain:** +5. **Depends on:** Phases 1, 2, 4, 9 (audit MAC).

### Phase 9 — AEC Production Readiness  ·  current **25** → target **75**  ·  risk **MED**
- **Files:** `packages/{documents,permits,coordination}`, `packages/integrations` (sandbox adapters).
- **Changes:** document-control hardening; workflow approvals; permit lifecycle enforcement;
  coordination workflow hardening; audit reporting; **sandboxed** Autodesk/Procore/Trimble adapters
  (remain sandboxed until explicit production approval).
- **Tests:** lifecycle state-machine invariants; approval gating; adapter sandbox assertions.
- **Gain:** +5. **Depends on:** Phases 1–4, 6.

---

## Readiness Scorecard (evidence-based, current state)

| Dimension | Score | Basis |
| --- | --- | --- |
| **Production Readiness** | **12%** | No auth, no CI, no telemetry, blob DB, no deploy asset |
| **Enterprise Readiness** | **10%** | No SSO, RBAC unwired, no compliance enforcement |
| **Security Readiness** | **8%** | Self-asserted identity; no middleware; staged-mode unenforced at runtime |
| **Scalability Readiness** | **10%** | Full-table scans, unbounded lists, single sync process |
| **AI Readiness** | **5%** | No model/prompt/eval/inference; deterministic sim only |
| **AEC Readiness** | **25%** | Strong domain modeling; not production-operable |

**Where it is genuinely strong:** domain modeling depth (permits/coordination/RFIs/review),
repository conformance discipline, audit hash-chaining, accessibility, and a clean dependency-free
codebase — an excellent *foundation*, not a product.

## Top Unresolved Blockers
1. **B1/B2/B3** — no real authn, RBAC unwired, staged-mode unenforced at runtime (trust boundary is cosmetic).
2. **B4** — no CI/CD or security scanning; unsafe code can merge.
3. **B5/B6** — blob DB with no FKs/indexes/constraints and no backups/restore.
4. **B7/B8** — no rate limiting/timeouts; no runtime observability.

## Recommended Next Execution Slice
**Slice A — "Real Trust Boundary" (Phase 1 core) + Phase 5 CI, in parallel:**
1. Replace self-asserted header with OIDC/JWT verification + server-side tenant/role resolution.
2. Wire `packages/authorization` `canPerform` into every route.
3. Enforce `assertStagedMode` in the write/outbound path.
4. Add `.github/workflows/ci.yml` (test + CodeQL + dep scan) with branch protection.

Rationale: B1–B4 are the only CRITICAL blockers; nothing else can be safely built or shipped until
the trust boundary is real and CI gates merges. Everything else (data, reliability, ops, AI)
depends on this slice. Reversible, test-backed, no new product surface.

---

## Slice A — EXECUTED (2026-07-12)

**Approved scope:** Phase 1 trust core + Phase 5 CI, managed-OIDC auth (verified via JWKS with
`node:crypto`, zero new dependencies). Suite **170 → 185 passing**.

### Delivered (verified by tests + live runtime)
- **Authentication (B1):** OIDC/JWT verification (`apps/api/src/auth/jwt.js`, `jwks.js`,
  `principal.js`, `config.js`). `XYGO_AUTH_MODE=oidc` derives tenant/user/role from a verified
  token; the self-asserted `x-staged-tenant-id` header **no longer grants access** in OIDC mode
  (test-proven). Staged mode retained as the explicit non-production default.
- **Authorization (B2):** `packages/authorization` `canPerform` now wired into **every** route
  (read/create/update) in `handlers.js`; RBAC matrix extended for API resources. Cross-tenant and
  role-denied requests return 403 (test-proven: `read_only_auditor` read-yes/create-no,
  cross-tenant deny, unknown-role deny).
- **STAGED_MODE enforcement (B3):** `assertStagedMode` invoked at server startup; a startup safety
  gate refuses to boot `STAGED_MODE=false` without OIDC, and refuses OIDC without issuer/audience
  (live-verified — process exits, nothing listens).
- **CI/CD (B4):** `.github/workflows/{ci,codeql,dependency-review}.yml` + documented branch
  protection (`.github/BRANCH_PROTECTION.md`).

### NOT yet done (remaining Phase 1 hardening — carry forward)
- Rate limiting, request body-size limits, request timeouts (B7).
- Security response headers (CSP/HSTS/X-Frame-Options/nocache).
- Audit keyed MAC/signature (B9) — still tamper-evident only.
- Secret management + per-environment config (B15).
- JWKS live-fetch is implemented but only unit-tested with a static key set (no live IdP wired).

### Revised readiness (post-Slice A)
| Dimension | Was | Now | Note |
| --- | --- | --- | --- |
| Security | 8% | **40%** | Real authn/authz + staged enforcement; missing rate-limit/headers/secrets/MAC |
| Tenant Isolation | 10% | **55%** | Token-derived tenant + RBAC when OIDC; DB-level isolation still absent |
| Production | 12% | **22%** | Trust core + CI in place; data/ops/reliability still blocking |
| CI/CD | 2% | **80%** | Workflows live; branch protection is a manual repo setting |

### Recommended next slice
**Slice B — finish Phase 1 hardening + start Phase 2 data layer:** rate limiting + body-size +
timeouts + security headers + audit MAC (closes B7/B9), then the Postgres relational schema with
FKs/indexes/migrations and the `postgres` repository backend (B5/B6), extending the conformance
harness to the new backend.

---

## Slice B — EXECUTED (2026-07-12)

Finished the Phase 1 hardening that Slice A deferred. Suite **185 → 193 passing**.

### Delivered (tests + live-verified)
- **Rate limiting (B7):** fixed-window limiter (`apps/api/src/http/rate-limit.js`) enforced in the
  server; 429 + `Retry-After`/`X-RateLimit-*`. Live: `max=3` → req 3 returns 429. Configurable via
  `XYGO_RATE_LIMIT_MAX`/`_WINDOW_MS`. *Limit: in-memory per-process; multi-instance needs Redis.*
- **Body-size limit (B7):** `XYGO_MAX_BODY_BYTES` (default 1 MiB); oversized → 413. Live-verified.
- **Request timeout (B7):** `XYGO_REQUEST_TIMEOUT_MS` (default 15s); non-stream requests → 408.
- **Security headers:** CSP/HSTS/X-Content-Type-Options/X-Frame-Options/Referrer-Policy/no-store on
  all API + SSE responses (`apps/api/src/http/headers.js`). Live-verified on the wire.
- **Audit tamper-proofing (B9):** optional HMAC-SHA256 `signature` over the event hash
  (`XYGO_AUDIT_SIGNING_KEY`). With a key the chain is tamper-**proof** (forged signature →
  `signature_mismatch`); without, tamper-evident as before (backward compatible). Verify report now
  includes `signed`. Live: `verify → valid, signed:true`.

### Revised readiness (post-Slice B)
| Dimension | Was (post-A) | Now |
| --- | --- | --- |
| Security | 40% | **62%** | rate-limit/headers/timeout/body-cap + tamper-proof audit; secrets mgmt still missing |
| Reliability | 15% | **25%** | request bounds added; outbox/workers/graceful-shutdown still pending |
| Data Integrity | 25% | **35%** | tamper-proof audit; relational DB still pending (Phase 2) |
| Production | 22% | **30%** | trust layer hardened; data/ops/reliability still blocking |

### Phase 2 (Postgres) — designed, NOT implemented
Blocked on a real Postgres (cannot verify here) + a target decision. See
`docs/audit/phase-2-data-layer-design.md`. **Decision required:** managed vs self-hosted vs defer.
