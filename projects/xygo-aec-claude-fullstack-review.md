# Xygo AEC Claude Full-Stack Review Handoff

Status: staged non-production build
Review goal: full-stack code and architecture review, with permission to write code changes when needed
Scope: local staged runtime only, no live providers, no production writes

## 1. What This Repo Is

`Xygo AI AEC Operating System` is a staged internal corporate/AEC operating platform that now includes:

- domain packages for communication, projects, documents, drawings, models, coordination, permits, construction, AI review, integrations, dashboards, finance hooks, observability, auth, audit, and staged-mode controls
- a staged API runtime in `apps/api`
- a staged browser runtime in `apps/web`
- staged persistence with `sqlite` as the default local repository mode
- staged SSE realtime stream
- staged audit history and audit-chain verification surface

This is not live.
It uses synthetic tenants, synthetic projects, synthetic workflows, and mock-only integrations.

## 2. Hard Guardrails

Treat these as non-negotiable:

- staged mode only
- no live deployment
- no production credentials
- no live Autodesk / Revit / AutoCAD / Rhino / Procore / Trimble / Microsoft / QuickBooks connections
- no production financial writes
- no real user traffic
- no external write side effects

## 3. Current Runtime Surfaces

### API

Main runtime:

- `apps/api/src/server.js`
- `apps/api/src/handlers.js`

Repository implementations:

- `apps/api/src/repositories/index.js`
- `apps/api/src/repositories/sqlite.js`
- `apps/api/src/repositories/file.js`
- `apps/api/src/repositories/memory.js`
- `apps/api/src/repositories/seed.js`

Realtime:

- `apps/api/src/realtime.js`

Current staged API coverage:

- projects
- coordination issues
- RFIs
- permit packages
- review sessions
- AI review runs
- AI findings
- AI finding dispositions
- tenant event stream
- tenant audit events
- audit verification
- executive dashboard
- transfer queue

OpenAPI file:

- `docs/api/openapi.v1.json`

### Web

Main runtime:

- `apps/web/src/server.js`
- `apps/web/public/index.html`
- `apps/web/public/app.js`
- `apps/web/public/styles.css`
- `apps/web/src/view-models.js`

Current browser surface:

- tenant selector
- executive summary cards
- workflow boards for projects, issues, RFIs, permits, review sessions, and AI findings
- staged live indicator backed by SSE
- skip navigation
- visible focus styles
- reduced-motion CSS handling

## 4. Persistence and Data

Default repository mode:

- `sqlite`

Default local DB path:

- `infrastructure/staged-data/api-store.sqlite`

Migration:

- `infrastructure/migrations/0001_staged_api.sql`

Fallback repository modes:

- `file`
- `memory`

Env controls:

- `XYGO_API_REPOSITORY_MODE=sqlite|file|memory`
- `XYGO_API_DB_PATH=...`
- `XYGO_API_DATA_PATH=...`

## 5. Important Domain Packages

- `packages/staged-mode`
- `packages/shared-contracts`
- `packages/auth`
- `packages/authorization`
- `packages/audit`
- `packages/communication`
- `packages/projects`
- `packages/documents`
- `packages/drawings`
- `packages/models`
- `packages/coordination`
- `packages/permits`
- `packages/construction`
- `packages/knowledge`
- `packages/ai-review`
- `packages/integrations`
- `packages/dashboards`
- `packages/finance-contracts`
- `packages/observability`
- `packages/test-fixtures`

## 6. Key Documents

- `projects/xygo-aec.md`
- `projects/xygo-aec-corporate-os-architecture.md`
- `docs/research/source-ledger.md`
- `docs/adr/0001-modular-monolith-baseline.md`
- `docs/architecture/domain-map.md`
- `docs/security/staged-mode-policy.md`
- `docs/operations/staged-deployment-report.md`
- `docs/activation/activation-checklist.md`
- `docs/testing/accessibility-baseline.md`
- `docs/operations/risk-register.md`

## 7. Test Commands

Run from repo root:

```bash
npm run test:web
npm run test:api
node --test apps/api/test/repository.test.js
npm run verify:audit
npm test
```

Latest known results at handoff:

- web tests: `6 passed, 0 failed`
- API tests: `36 passed, 0 failed`
- repository tests: `4 passed, 0 failed`
- full suite: `131 passed, 0 failed`

## 8. Start Commands

API:

```bash
node apps/api/src/server.js
```

Web:

```bash
node apps/web/src/server.js
```

Default local URLs:

- API: `http://127.0.0.1:3000`
- Web: `http://127.0.0.1:4173`

## 9. What Was Recently Added

Most recent completion pass added:

- SQLite-backed staged persistence as default
- file and memory repository fallback modes
- staged SSE event stream
- browser runtime
- persistent tenant audit event surface
- audit verification endpoint
- stronger OpenAPI component schema section
- accessibility runtime affordances and tests

## 10. Review Priorities For Claude

Please review this like a senior full-stack/codebase review, not a product brainstorm.
Claude is allowed to write code changes, tests, and refactors if needed to fix findings or close gaps, as long as all work stays inside staged non-production guardrails.
Focus on:

1. architectural correctness
2. security and tenant-isolation risks
3. data consistency risks across repository implementations
4. API contract consistency
5. audit-chain correctness and persistence behavior
6. staged-mode enforcement holes
7. browser runtime risks or regressions
8. missing tests for sensitive paths
9. maintainability or duplication problems
10. places where runtime claims exceed implementation reality

## 11. Specific Questions To Answer

Ask Claude to answer these directly:

1. What are the highest-severity correctness or security issues in this staged full stack?
2. Are the repository implementations behaviorally consistent across `memory`, `file`, and `sqlite` modes?
3. Are there tenant-isolation leaks or bypass risks in the API handlers or SSE transport?
4. Is the audit-event chaining and verification logic sufficient for the stated staged claims?
5. Where does the OpenAPI contract still materially diverge from runtime behavior?
6. Which areas most need refactoring before adding more features?
7. What tests are missing for the most sensitive flows?
8. Does the browser runtime create any accessibility or trust issues that should be fixed before further expansion?

## 12. Important Caveats

This build is complete for staged scope as currently implemented, but still intentionally lighter than a production system in several areas:

- OpenAPI schemas are broader, but not exhaustive for every entity field
- UI runtime is functional and responsive, but not a full framework-grade application shell
- accessibility testing is real and automated, but not a complete browser/assistive-tech audit stack
- integrations remain mock-only by design
- no production deployment path is enabled

## 13. Suggested Claude Prompt

Use this prompt with Claude:

```text
Review this repository as a full-stack staged SaaS build.
You are allowed to write code, tests, and refactors if needed.

Primary goals:
- find bugs
- find security/tenant-isolation risks
- find data consistency issues
- find API/runtime mismatches
- find audit/history weaknesses
- find missing tests
- fix or patch what is worth fixing in-place when the correct change is clear

Review mindset:
- findings first, ordered by severity
- include exact file references
- keep summaries brief
- do not assume this is production-live; it is staged-only by design
- if you make code changes, explain exactly what changed and why
- keep all changes staged-only and local-only
- do not add live providers, production credentials, or production write paths

Focus files first:
- apps/api/src/handlers.js
- apps/api/src/server.js
- apps/api/src/repositories/index.js
- apps/api/src/repositories/sqlite.js
- apps/api/src/repositories/file.js
- apps/api/src/repositories/memory.js
- apps/api/src/realtime.js
- apps/web/public/app.js
- apps/web/public/index.html
- apps/web/public/styles.css
- packages/audit/src/foundation.js
- docs/api/openapi.v1.json

Then review supporting domain packages as needed.

Answer these:
1. Highest-severity findings
2. Open questions
3. Test gaps
4. Refactor recommendations
5. Code changes made, if any
```

## 14. Bottom Line

Claude should treat this repo as:

- a staged full-stack AEC/corporate operations system
- implemented end-to-end enough to review real runtime behavior
- still intentionally non-production
- suitable for a serious code review focused on correctness, security, consistency, and next refactor points
- open for direct staged-safe code changes if Claude decides fixes are warranted
