# Xygo AEC — Full-Stack Staged Review Results

Reviewer: Claude (senior full-stack review)
Date: 2026-07-11
Scope: staged non-production runtime only. No live providers, no production writes.
Repo root: `/Users/Ai/.openclaw/workspace`

## Summary

- Read the core API / web / audit / repository code.
- Verified behavior against a live staged server.
- Ran the full suite: **131 → 132 passing, 0 failing** (added one regression test).
- Applied **two clearly-correct, staged-safe fixes** (server-crash DoS, browser XSS) plus a regression test.
- Documented the remaining findings as recommendations (not yet coded), ordered by severity.

---

## Highest-Severity Findings

### 1. [HIGH — FIXED] Unauthenticated DoS: one malformed POST body crashes the whole API

`apps/api/src/handlers.js` called `parseBody()` (→ `JSON.parse`) *outside* the per-endpoint
`try/catch`, and `apps/api/src/server.js`'s `req.on("end")` had no guard.

Confirmed live: a POST with body `{bad json` threw an uncaught `SyntaxError`, **killed the
process**, and the following request received no response.

**Fix applied:**
- Wrapped `handleApiRequest` in a top-level `try/catch` — `SyntaxError` → `400 bad_request`,
  any other error → `500 internal_error`.
- Added defense-in-depth `try/catch` in `server.js` so no request can crash the process.

Re-tested live after fix: malformed body → `400`, server still serving (`/health` → `200`).

### 2. [HIGH — FIXED] Stored XSS in the web dashboard

`apps/web/public/app.js` rendered API-supplied `title` / `status` / `detail` via
`card.innerHTML = \`…${title}…\``. A project created with
`name: "<img src=x onerror=…>"` (the create endpoint validates presence, not content) would
execute in every viewer's browser.

**Fix applied:** rebuilt the card with `document.createElement` + `textContent`. Legitimate
data renders identically; script payloads now render as inert text.

### 3. [HIGH — by design; must not ship as-is] Tenant isolation is self-asserted, not authenticated

`requireTenantAccess` only checks that header `x-staged-tenant-id` **equals the path tenant**.
There is no token proving the caller belongs to that tenant — any client can read/write any
tenant by matching the header. SSE is weaker: `realtime.js` also accepts the tenant via
`?stagedTenantId=` query param (because `EventSource` cannot send headers).

Acceptable for synthetic staged data, but this is the #1 thing that must be replaced with real
authn/authz before any activation.

**Recommendation:** document explicitly in `docs/security/staged-mode-policy.md` and add a
failing "activation gate" test so it cannot silently graduate to production.

### 4. [MEDIUM — FIXED] OpenAPI materially diverged from runtime auth

`docs/api/openapi.v1.json` declared **no security scheme** and documented only the `tenantId`
**path** parameter. The required `x-staged-tenant-id` header and the SSE `stagedTenantId` query
param were absent — a spec-conformant client would get `403` on every endpoint.

**Fix applied:** added `components.securitySchemes` (`stagedTenantHeader` apiKey/header,
`stagedTenantQuery` apiKey/query for SSE, `stagedUserHeader` optional actor id) and a global
`security` requirement. Overrode `/health` to public (`security: []`) and the SSE stream to the
query-param scheme. Validated: valid JSON, no dangling scheme refs, 18 ops inherit header auth,
1 public, 1 query-scoped. Scheme descriptions call out the staged-only, unauthenticated nature.

Still undocumented (minor): `ai-findings` POST rejects descriptions lacking staged cautionary
language ("Potential issue" / "Requires qualified review").

### 5. [MEDIUM] Repository behavioral divergences (memory / file / sqlite)

Mostly consistent (same seed, same contract functions, same duplicate-id errors, consistent
audit ordering). Real divergences:

- **AI-findings tenancy is modeled differently.** `sqlite` denormalizes `tenant_id` into a
  column *at create time* (falling back to `"unknown"` if the run isn't found); `memory` / `file`
  derive tenant via a **live join** on `reviewRunId`. Consistent today, but they would drift if a
  run were reassigned, and `createAiFinding` validates run existence in sqlite but not in
  memory/file.
- **`file` does a full read-modify-write of the entire JSON document per operation.**
  **[write atomicity FIXED]** `writeState` now serializes to a pid-scoped temp file and
  `rename()`s over the target, so a crash or concurrent reader can never observe a torn / partial
  store (previously `writeFileSync` truncated in place). Verified: store stays valid JSON, no
  `.tmp` leftovers, cross-instance reads consistent. *Boundary (not fixed):* two separate
  processes writing the same file can still lost-update (last rename wins) — real multi-writer
  safety needs file locking, out of scope for single-process staged. `memory` / `sqlite` do not
  share these failure modes.
- `sqlite.setAiFindingDisposition` issues **two redundant `UPDATE`s** and re-reads/rewrites an
  unchanged `tenant_id`; `.get(findingId).tenant_id` would throw if the row disappeared between
  statements.

### 6. [LOW / latent — FIXED] Audit-chain serialization only stabilized top-level keys

`packages/audit/src/foundation.js` `stableSerialize` used
`JSON.stringify(value, Object.keys(value).sort())`. The array form is a top-level key
allowlist applied at every depth, so **nested-object content was silently dropped** from the
hash (demonstrated: `{ref:{note:"AAA"}}` and `{ref:{note:"ZZZ"}}` both serialized to `ref:{}`) —
a tamper-evidence hole for any object-valued state ref.

**Fix applied:** replaced with a recursive `canonicalize` (sort keys at every depth, preserve
array order). Verified byte-identical output for today's flat scalar events, so existing chains
stay valid (hash unchanged). Added audit tests: specific tampered-event id, broken
`previousHash` link, nested-object no-collision + round-trip + tamper detection, and key-order
independence.

**Boundary (not fixed — out of staged scope):** the chain is tamper-*evident* against partial
edits, not tamper-*proof*. There is no signing key/HMAC, so an actor who edits an event and
recomputes all subsequent hashes would still verify. Production integrity needs a keyed MAC or
signature; noted for the activation phase.

### 7. [LOW] Dead code

- `handlers.js` issues GET computes `const projectId = parts.length > 4 ? parts[4] : null` and
  never uses it; `listIssuesByProject` exists in every repo but is **unreachable** via the API.
- Title-case `headers["X-Staged-Tenant-Id"]` fallbacks are dead — Node lowercases all header keys.

---

## Answers to the Handoff Questions

1. **Highest-severity issues:** the DoS (#1) and stored XSS (#2) — both fixed; then the
   self-asserted tenant model (#3).
2. **Repository consistency:** behaviorally consistent for current flows, with the caveats in #5
   (finding-tenancy modeling, file write concurrency, redundant sqlite update).
3. **Tenant-isolation leaks:** no cross-tenant *leak* in handlers (every write validates
   parent-resource tenancy; disposition re-checks via the run; related-issue existence is
   tenant-scoped). The real risk is that isolation is **self-asserted** (#3), identically in REST
   and SSE.
4. **Audit chain:** sufficient for staged claims — per-tenant hash chain, tamper-evident,
   verifiable. One latent serialization caveat (#6).
5. **OpenAPI divergence:** missing auth header / query param + no security scheme (#4).
6. **Refactor priority:** (a) a shared repository **conformance test harness** run against all
   three backends; (b) collapse the ~460-line 7-branch `if`-ladder in `handlers.js` — every POST
   repeats validate → tenant-check → create → audit → 201; (c) unify `extractAuth` (duplicated
   across `handlers.js` and `realtime.js` with different shapes).
7. **Missing tests:** malformed-body crash (added); **repository parity suite** across
   memory/file/sqlite (highest value); audit-chain **tamper** test (`verify.js` is a demo, not a
   test); web output-escaping test; SSE cross-tenant rejection.
8. **Browser trust / accessibility:** the XSS was the material trust issue (fixed). A11y
   affordances (skip nav, focus styles, reduced-motion) intact; no regressions introduced.

---

## Changes Made (all staged-safe, local-only)

| File | Change |
| --- | --- |
| `apps/api/src/handlers.js` | Top-level error boundary (malformed JSON → `400`); then table-driven collection router replacing the seven duplicated POST/GET ladders. |
| `apps/api/src/server.js` | `try/catch` around request handling so no request can crash the process. |
| `apps/web/public/app.js` | DOM / `textContent` rendering, eliminating the `innerHTML` XSS sink. |
| `apps/api/test/app.test.js` | Regression test: malformed body returns `400`, not a crash. |
| `apps/api/test/repository-conformance.test.js` | New conformance harness: identical contract suite across all three backends + cross-backend equivalence check (25 tests). |
| `docs/api/openapi.v1.json` | Added `securitySchemes` + global `security`; `/health` public, SSE stream query-scoped. |
| `apps/api/src/staged-auth.js` | New single enforcement point for staged tenant scope; unifies the two `extractAuth` copies. |
| `apps/api/src/handlers.js`, `apps/api/src/realtime.js` | Rewired to the shared helper (REST ignores query param; SSE honors it — behavior preserved). |
| `apps/api/test/staged-auth.test.js` | Auth helper coverage + **activation gate** pinning the self-asserted model and the checklist item. |
| `docs/security/staged-mode-policy.md` | Documented the self-asserted tenant limitation and the activation prerequisite. |
| `packages/audit/src/foundation.js` | Recursive `canonicalize` so nested state-ref content is hashed (closes the tamper-evidence hole); flat-event hashes unchanged. |
| `packages/audit/test/foundation.test.js` | +4 tests: tampered-event id, broken chain link, nested-object hashing, key-order independence. |
| `apps/api/src/repositories/file.js` | Atomic write (temp file + `rename`) so crashes / concurrent readers never see a torn store. |
| `apps/api/test/repository.test.js` | +2 tests: atomic write leaves no `.tmp` artifacts; cross-instance writes stay consistent. |

### Verification

```
npm test   → 170 passing, 0 failing
npm run verify:audit → valid chain
Live: malformed POST → 400; /health → 200 (server survives)
Live: create → 201 / audit-event written; missing field → 400; cross-tenant parent → 403
OpenAPI: valid JSON, no dangling scheme refs, 18 header-auth ops + 1 public + 1 query-scoped
```

---

## Follow-Ups — Status

Completed since the initial review:

1. ~~Repository conformance test harness across `memory` / `file` / `sqlite`~~ — **done** (#5 risk locked by tests).
2. ~~De-duplicate the `handlers.js` POST route ladder~~ — **done** (table-driven; behavior verified identical).
4. ~~OpenAPI security scheme + header / query param~~ — **done** (#4).

3. ~~Document/gate the self-asserted tenant auth model + unify `extractAuth`~~ — **done**
   (single enforcement point in `staged-auth.js`; activation gate ties the code to the checklist).

5. ~~Audit-chain tamper test + guard the nested-object serialization case~~ — **done** (#6).

6. ~~Harden the `file` backend's read-modify-write against concurrent writes~~ — **done**
   (atomic temp-file + rename; write atomicity guaranteed, torn writes eliminated).

Deferred to the activation phase (out of staged scope):

7. Add a keyed MAC / signature to audit events for production tamper-*proofing*.
8. Real tenant authn/authz to replace the self-asserted staged model (gated by the activation
   checklist + `apps/api/test/staged-auth.test.js`).
9. Multi-process write locking for the `file` backend, if it is ever run multi-writer
   (`sqlite` is the better path there).
