# Xygo 2.0 — Completed Build Report

_Generative business-platform pivot: phased build complete._

- **Repo:** https://github.com/XenXiii/XygoAEC · branch `main`
- **Date:** 2026-08-01
- **Suite:** 262 tests — 261 pass, 1 gated Postgres skip (runs in CI with `XYGO_TEST_PG_URL`)
- **Nature:** Staged / non-production. Synthetic tenants + data, deterministic generation
  (no live AI), mock-only integrations, no production writes, no live payments.

## What Xygo 2.0 is

Xygo generates and deploys custom AI-powered operating systems for SMBs (construction and service
businesses first). A **blueprint** captures how a business operates → recommends reusable
**modules** → those modules become working surfaces (field reporting, client portal, dashboards) →
packaged as repeatable **service offers**.

## Phased build

| Phase | Deliverable | Commit |
| --- | --- | --- |
| 1 | Product surface reframed to the platform-builder positioning (marketing site) | (site rebuild) |
| 2 | Business Platform Blueprint module | `aff7c5f` |
| 3 | Field Reporting proof package | `5d40cee` |
| 4 | Client Portal package | `ee168ba` |
| 5 | Service-packaging landing | `9a7a9fc` |

## End-to-end flow (all staged)

```
Blueprint intake  ->  recommends field_reporting + client_portal (+ others)
      ->  capture a field report (note/photo/checklist/voice placeholders)
      ->  deterministic AI draft simulation
      ->  human review + approve
      ->  approved report appears in the branded Client Portal
      ->  offers packaged on /services
```

## Domain packages (added/changed)

- **`packages/platform-blueprint`** — module library (11 reusable modules), intake contract, and
  deterministic `generatePlatformBlueprint` (keyword + industry-baseline recommendations, ordered
  build steps, staged summary; integrations recorded `staged_mock_only`).
- **`packages/field-reporting`** — intake with capture placeholders, deterministic
  `generateReportDraft` (no live AI), `setReviewStatus` transitions
  (`captured → draft_generated → in_review → approved | changes_requested`), and `toClientView`
  (approved-only client projection).
- **`packages/client-portal`** — read-only `buildClientPortalView` composing project status +
  approved reports + files + updates + a non-actionable staged payment placeholder.
- **`packages/authorization`** — RBAC matrix extended for `platform_blueprint`, `field_report`,
  and `client_portal` (read/create/update as appropriate).
- **`packages/test-fixtures`** — synthetic blueprints, field reports (drafted + approved), and
  portal updates.

## API surface (staged, tenant-scoped)

| Method | Route | Notes |
| --- | --- | --- |
| GET/POST | `/v1/tenants/{t}/platform-blueprints` | list / generate blueprint |
| GET | `/v1/tenants/{t}/platform-blueprints/{id}` | read one |
| GET/POST | `/v1/tenants/{t}/field-reports` | list / capture |
| GET | `/v1/tenants/{t}/field-reports/{id}` | read one |
| POST | `/v1/tenants/{t}/field-reports/{id}/draft` | generate AI draft (simulation) |
| POST | `/v1/tenants/{t}/field-reports/{id}/review` | set review status (approve gates client visibility) |
| GET | `/v1/tenants/{t}/client-portal` | read-only composed portal per project |

All write paths emit audit events; all routes pass the auth/RBAC/tenant gate; all are documented in
`docs/api/openapi.v1.json` and enforced by the OpenAPI contract test.

## Web surfaces

- **Marketing:** `/` (Home), `/services` (the six offers), `/about`, `/mission`, `/investors`,
  `/demo`, `/contact`, plus `/privacy`, `/terms`, `/accessibility`, `/404`.
- **Staged operator/product panels:** `/platform-blueprint.html`, `/field-reports.html`
  (capture → draft → approve), `/client-portal.html` (approved-only), `/control-room.html`.
- All data panels render with `textContent`/DOM (XSS-safe) and show a SIMULATED-DATA banner.

## Service packages (`/services`)

Framed by the business process each replaces; honestly tagged:

- **Staged demo:** AI Platform Blueprint, AI Client Portal, AI Field Report System, Contractor
  Operating Dashboard — each links to its working staged surface.
- **On the roadmap:** AI Operations Audit, AI Compliance Tracker.

## Run / demo

```bash
npm start          # API :3000 + web :4173 + worker
# open http://127.0.0.1:4173  (Home) or /services
npm test           # 262 tests
npm run verify:audit
```

Clean-slate demo: `XYGO_API_REPOSITORY_MODE=memory npm start`.

## Guardrails preserved

Staged-only; synthetic data; deterministic generation (no live model calls); integrations
`staged_mode_only`; client portal exposes **approved reports only**; payment is a permanent staged
placeholder (no amount, no action); server refuses to boot in an unsafe auth config.

## Deferred to activation (not built — from the production-readiness audit)

Real tenant authn/authz (OIDC wiring), secret management, distributed tracing + dashboards +
alerting/provider wiring, a managed deployment of the implemented PostgreSQL outbox, and a real AI model
runtime to replace the deterministic simulations. See
`docs/audit/phase-0-production-readiness-audit.md`.
