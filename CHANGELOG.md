# Changelog

## Production-Readiness Slice B — Phase 1 Hardening — 2026-07-12

Finished the Phase 1 hardening deferred by Slice A. Suite **185 → 193 passing**. Still zero
third-party dependencies.

- **Rate limiting:** fixed-window limiter (`apps/api/src/http/rate-limit.js`), 429 + `Retry-After`
  / `X-RateLimit-*`; `XYGO_RATE_LIMIT_MAX`/`_WINDOW_MS`. (In-memory per-process; Redis for multi-instance.)
- **Request bounds:** body-size cap (`XYGO_MAX_BODY_BYTES`, default 1 MiB → 413) and request
  timeout (`XYGO_REQUEST_TIMEOUT_MS`, default 15s → 408).
- **Security headers:** CSP/HSTS/nosniff/frame-deny/referrer/no-store on all responses
  (`apps/api/src/http/headers.js`).
- **Audit tamper-proofing:** optional HMAC-SHA256 signature over the event hash
  (`XYGO_AUDIT_SIGNING_KEY`); tamper-proof when keyed, tamper-evident and backward-compatible when
  not. Verify report gains `signed`.
- **Tests:** `rate-limit.test.js` (+3), `security-headers.test.js` (+1), audit MAC (+4).
- **Phase 2 (Postgres):** designed only (`docs/audit/phase-2-data-layer-design.md`) — needs a real
  Postgres to verify + a target decision; not implemented.

## Production-Readiness Slice A — Trust Layer + CI — 2026-07-12

Phase 0 audit (`docs/audit/phase-0-production-readiness-audit.md`) then the approved Slice A:
real authentication, RBAC enforcement, runtime staged-mode enforcement, and CI. Managed-OIDC
verified via JWKS using `node:crypto` — **zero new dependencies**. Suite **170 → 185 passing**.

- **Authentication:** OIDC/JWT verification (`apps/api/src/auth/{jwt,jwks,principal,config}.js`).
  `XYGO_AUTH_MODE=oidc` derives tenant/user/role from a verified token; staged mode remains the
  explicit non-production default. Self-asserted headers no longer grant access under OIDC.
- **Authorization:** `packages/authorization` `canPerform` wired into every route; RBAC matrix
  extended for API resources; cross-tenant / role-denied → 403.
- **STAGED_MODE enforced at runtime:** `assertStagedMode` at startup + a boot-time safety gate
  (refuses `STAGED_MODE=false` without OIDC; refuses OIDC without issuer/audience).
- **CI/CD:** `.github/workflows/{ci,codeql,dependency-review}.yml` + `BRANCH_PROTECTION.md`.
- **Tests:** `apps/api/test/auth.test.js` (+15) — JWT verify matrix, principal mapping, route RBAC.
- **Carry-forward (not yet done):** rate limiting, body-size/timeout limits, security headers,
  audit MAC, secret management, live IdP wiring. See the audit doc's "Slice A — EXECUTED" section.

## Full-Stack Review Hardening Pass — 2026-07-11

Senior full-stack review of the staged Xygo AI AEC OS, with fixes applied in place.
All work is staged-only and local-only: no live providers, production credentials, or
production write paths were added. Full write-up:
`projects/xygo-aec-claude-fullstack-review-results.md`.

Test suite: **131 → 170 passing, 0 failing**. `npm run verify:audit` reports a valid chain.

Committed locally as `57691a3` (initial commit). Remote push pending (GitHub auth not yet
completed in this environment).

---

### Security fixes

- **Unauthenticated DoS via malformed request body (HIGH).** A POST with an invalid JSON body
  threw an uncaught `SyntaxError` and crashed the whole API process. Added a top-level error
  boundary in `handleApiRequest` (malformed JSON → `400`, unexpected → `500`) plus a
  defense-in-depth `try/catch` in the server request lifecycle so no request can crash the
  process. Verified live: bad body → `400`, server stays up.
  - `apps/api/src/handlers.js`, `apps/api/src/server.js`
  - Test: `apps/api/test/app.test.js` (malformed body returns 400)

- **Stored XSS in the web dashboard (HIGH).** Board cards were rendered via `innerHTML` with
  unescaped API data, so a record name/description containing markup would execute in the
  browser. Rebuilt card rendering with `createElement` + `textContent`.
  - `apps/web/public/app.js`

- **Self-asserted tenant scope (HIGH, by design for staged).** Tenant access is granted purely
  when the caller-supplied `x-staged-tenant-id` header (or `stagedTenantId` query param for SSE)
  matches the path tenant — no credential. Unified the two divergent `extractAuth` copies into a
  single enforcement point, documented the limitation, and added an activation-gate test that
  keeps the "tenant isolation verification completed" checklist item honest.
  - `apps/api/src/staged-auth.js` (new), `apps/api/src/handlers.js`, `apps/api/src/realtime.js`
  - `docs/security/staged-mode-policy.md` (documented limitation)
  - Test: `apps/api/test/staged-auth.test.js` (helper coverage + activation gate)

### Correctness / integrity fixes

- **Audit-chain hashing dropped nested content.** `stableSerialize` used the array-replacer form
  of `JSON.stringify`, which only allowlists top-level keys — object-valued state refs serialized
  to `{}`, a tamper-evidence hole. Replaced with a recursive `canonicalize` (sort keys at every
  depth, preserve array order). Byte-identical output for today's flat events, so existing chains
  stay valid.
  - `packages/audit/src/foundation.js`
  - Tests: `packages/audit/test/foundation.test.js` (+4: tampered-event id, broken chain link,
    nested-object no-collision + round-trip + tamper detection, key-order independence)
  - Boundary (not fixed, activation phase): tamper-evident, not tamper-proof — needs a keyed
    MAC/signature for production.

- **File repository torn writes.** `writeState` used `writeFileSync` (truncate-in-place), so a
  crash or concurrent reader could observe a partial store. Switched to atomic write: serialize
  to a pid-scoped temp file, then `rename()` over the target.
  - `apps/api/src/repositories/file.js`
  - Tests: `apps/api/test/repository.test.js` (+2: atomic write leaves no `.tmp`; cross-instance
    writes consistent)
  - Boundary (not fixed): multi-process lost-update still possible — needs file locking; use
    `sqlite` for multi-writer.

### Contract fixes

- **OpenAPI omitted authentication.** The spec declared no security scheme and only the path
  `tenantId`, so a spec-conformant client would `403` on every call. Added
  `components.securitySchemes` (`stagedTenantHeader`, `stagedTenantQuery` for SSE,
  `stagedUserHeader`) and a global `security` requirement; `/health` overridden to public and the
  SSE stream to the query-param scheme. Validated: valid JSON, no dangling refs, 18 header-auth
  ops + 1 public + 1 query-scoped.
  - `docs/api/openapi.v1.json`

### Refactors / test infrastructure

- **De-duplicated the handlers.js route ladder.** The seven near-identical POST/GET blocks
  (validate → tenant/parent guard → create → audit → 201) collapsed into a table-driven
  `collectionResources` config + one `handleCollectionCreate`. Behavior verified identical
  (live smoke + full suite).
  - `apps/api/src/handlers.js`

- **Repository conformance harness.** New parameterized suite runs the same contract against
  `memory` / `file` / `sqlite`, plus a cross-backend equivalence check that deep-compares outputs
  (locks the AI-findings tenancy behavior against silent drift). 25 tests; negative-control
  verified it catches divergence.
  - `apps/api/test/repository-conformance.test.js` (new)

### Repository housekeeping

- Added `.gitignore` excluding runtime artifacts (`infrastructure/staged-data/api-store.*`,
  `.openclaw/`, `node_modules/`, temp/log files); kept `infrastructure/staged-data/.gitkeep`.

---

### Files added

- `apps/api/src/staged-auth.js`
- `apps/api/test/staged-auth.test.js`
- `apps/api/test/repository-conformance.test.js`
- `projects/xygo-aec-claude-fullstack-review-results.md`
- `.gitignore`
- `CHANGELOG.md`

### Files modified

- `apps/api/src/handlers.js`
- `apps/api/src/server.js`
- `apps/api/src/realtime.js`
- `apps/api/src/repositories/file.js`
- `apps/api/test/app.test.js`
- `apps/api/test/repository.test.js`
- `apps/web/public/app.js`
- `packages/audit/src/foundation.js`
- `packages/audit/test/foundation.test.js`
- `docs/api/openapi.v1.json`
- `docs/security/staged-mode-policy.md`

### Deferred to activation phase (out of staged scope)

- Keyed MAC / signature for audit events (tamper-proofing).
- Real tenant authn/authz to replace the self-asserted staged model.
- Multi-process write locking for the file backend (or standardize on sqlite).
