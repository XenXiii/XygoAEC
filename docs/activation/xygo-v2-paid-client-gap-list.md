# Xygo V2 Paid-Client Activation Gap List

Source of truth:

- Completed staged build report: `docs/xygo-2.0-build-report.md`
- Activation gate checklist: `docs/activation/activation-checklist.md`
- API contract: `docs/api/openapi.v1.json`

Purpose: convert the completed staged Xygo V2 build into a paid-client-ready operating system offer.
This file tracks only unfinished activation work. Do not remove staged guardrails unless replacing
them with production-safe auth, tenant isolation, secrets, deployment, monitoring, and tests.

## Launch Definition

Xygo V2 is paid-client-ready when a first contractor or home-service client can be onboarded into a
secure tenant, use the field-reporting and client-portal workflow with real project data, and receive
support under a defined legal, operational, and deployment process.

The initial paid offer is:

**Contractor Field Reports + Client Portal**

This offer turns field notes, photos, checklist items, and project updates into reviewed client-facing
reports inside a branded portal.

## 1. Critical Launch Blockers

### 1. Real Client Authentication

Status: unfinished.

Next action: configure `XYGO_AUTH_MODE=oidc` with a real identity provider and remove self-asserted
staged-header access from paid environments.

Complete when:

- Real users can log in.
- JWTs map to one tenant and role set.
- Cross-tenant access is denied.
- `x-staged-tenant-id` is ignored or rejected in production mode.
- Auth tests cover valid token, expired token, tampered token, wrong tenant, and missing role.

### 2. Production Tenant/RBAC Enforcement

Status: unfinished.

Next action: define paid-client roles and wire permissions to every client-facing route.

Required roles:

- `xygo_admin`
- `client_owner`
- `client_staff`
- `client_viewer`

Complete when:

- Every API route has allow/deny role tests.
- Client users cannot see another tenant.
- Viewers cannot create, draft, approve, or edit reports.
- Only approved client-visible records appear in the portal.

### 3. Production Deployment

Status: unfinished.

Next action: create a real API, web, and worker deployment target with HTTPS, environment variables,
health checks, and rollback instructions.

Complete when:

- Staging and production deploy from `main`.
- API, web, and worker are separate managed processes.
- `/health`, `/ready`, and `/metrics` are reachable where appropriate.
- Rollback can be executed from written steps.

### 4. Secret Management

Status: unfinished.

Next action: move OIDC, database, AI, storage, email, and integration secrets into a managed secret
store for deployment.

Complete when:

- No production secret is stored in the repo.
- Local examples use placeholders only.
- Production boot fails if required secrets are missing.
- Secret rotation steps are documented.

### 5. Client Legal/Compliance Packet

Status: unfinished.

Next action: prepare the first-client paperwork and policy packet.

Complete when:

- MSA or order-form template exists.
- Privacy and data-processing terms exist.
- AI/human-review terms are stated.
- Incident contact and support responsibilities are defined.
- First client can sign without unclear data or service terms.

## 2. Required For The First Client

### 6. Managed Postgres Cutover

Status: partially implemented, not activated.

Next action: provision managed Postgres, apply `infrastructure/migrations/postgres/0001_init.sql`,
set `XYGO_API_REPOSITORY_MODE=postgres`, and run the Postgres conformance suite.

Complete when:

- Staging runs on Postgres.
- `XYGO_TEST_PG_URL` runs the skipped Postgres test.
- Migrations are repeatable.
- Tenant data persists across restarts.

### 7. Tenant Provisioning Flow

Status: first staged provisioning slice completed; production persistence and identity-provider
invites remain unfinished.

Implemented: `npm run provision:tenant` creates a staged tenant, users, paid-client roles, business
profile, starter project, deterministic blueprint, branded portal configuration, starter portal data,
and provisioning event. Tests cover safe reruns, conflicting reruns, and second-tenant isolation.

Next action: connect the same contract to managed Postgres and production identity-provider invites
after the production activation gates are approved.

Complete when:

- A new paid client can be provisioned without editing seed fixtures by hand.
- Provisioning is logged and testable.
- Provisioning can be repeated safely for a second tenant.

### 8. Client-Ready Intake-To-Blueprint Workflow

Status: staged demo only.

Next action: turn the demo intake into a saved first-client intake workflow with reviewable blueprint
output.

Complete when:

- Client intake is persisted.
- Xygo can review and approve the blueprint.
- Selected modules drive the implementation scope.
- Intake and blueprint records are tenant-scoped.

### 9. Real Field-Report Uploads

Status: placeholder only.

Next action: connect tenant-scoped object storage for photos, files, and attachments.

Complete when:

- Field staff can attach files/photos to reports.
- Files are scoped by tenant and project.
- Only approved files appear in the client portal.
- Upload size, file type, malware scanning or quarantine policy, and retention rules are documented.

### 10. First Paid Offer Spec

Status: completed for the first staged activation slice.

Implemented: `contractor-field-reports-offer.md` defines scope, pricing model, deliverables,
exclusions, acceptance criteria, demo script, and change controls.

Complete when:

- Scope is documented.
- Price or pricing model is documented.
- Deliverables are documented.
- Demo script is documented.
- Onboarding checklist and acceptance criteria are documented.

## 3. Required For Reliable Delivery

### 11. Observability And Alerts

Status: partially implemented, not connected.

Next action: connect structured logs and Prometheus-style metrics to a real dashboard and alerting
system.

Complete when:

- Error rate, latency, auth failures, worker failures, queue backlog, and storage failures alert.
- Logs include request id, tenant id, actor id, route, status, and duration.
- Runbooks tell the operator what to do for each alert.

### 12. Durable Worker/Outbox In Production

Status: tested locally, not production-deployed.

Next action: run the worker as a managed process using production Postgres and durable outbox state.

Complete when:

- Queued work survives API and worker restarts.
- Retry/backoff and dead-letter behavior are visible.
- Worker status is included in monitoring.

### 13. Backups And Restore Drill

Status: unfinished.

Next action: enable managed Postgres backups and write a restore drill.

Complete when:

- Automated backups and point-in-time recovery are enabled.
- A restore drill recreates staging from backup.
- Restore steps are documented and timed.

### 14. Release Gates

Status: partially implemented.

Next action: enforce branch protection, required CI checks, CodeQL, dependency review, and deployment
approval.

Complete when:

- Broken tests block merge.
- Security scan failures block merge or require explicit approval.
- Production deploy requires approval.
- Rollback is tested.

### 15. Support And Operations Runbooks

Status: unfinished.

Next action: write SOPs for onboarding, incidents, failed jobs, access changes, tenant offboarding,
and support escalation.

Complete when:

- Someone other than the builder can operate a paid client account using docs only.
- Support responsibilities and response expectations are clear.

### 16. AI Runtime And Evaluation

Status: deterministic simulation only.

Next action: connect a real model behind a provider abstraction with prompt registry, eval set,
cost tracking, and human approval gates.

Complete when:

- Real AI output is evaluated against approved thresholds.
- Every generated client-facing output requires review before publication.
- Costs, prompts, model versions, and source context are logged.
- Deterministic fallback remains available for demos and failures.

## 4. Optional Future Improvements

### 17. Live Integrations

Status: optional.

Next action: add sandbox integrations only when the first paid vertical requires them.

Complete when:

- Each integration has OAuth, sync logs, retries, and a kill switch.
- No live write is enabled without explicit activation approval.

### 18. Payments Inside Client Portal

Status: optional.

Next action: decide whether first clients use normal invoicing or portal payments.

Complete when:

- Portal payments are intentionally deferred, or Stripe/payment flow is connected and tested.

### 19. Advanced Dashboard Builder

Status: optional.

Next action: let Xygo generate client-specific dashboards from selected blueprint modules.

Complete when:

- A new client dashboard can be configured without code changes.

### 20. Multi-Vertical Templates

Status: optional.

Next action: create reusable templates for salons, HVAC, home services, medical admin, and
contractors after the first contractor package is activated.

Complete when:

- Each vertical template has intake questions, recommended modules, demo data, pricing, and outreach
copy.

## Exact Next 10 Tasks

1. ~~Write the first paid offer spec for Contractor Field Reports + Client Portal.~~ Completed.
2. ~~Create the first-client onboarding checklist.~~ Completed.
3. ~~Create a tenant provisioning script or admin command.~~ Completed for staged activation;
   production persistence/invites remain gated.
4. Configure Postgres staging and run the skipped Postgres test with `XYGO_TEST_PG_URL`.
5. Add production/staging environment documentation for auth, database, secrets, web, API, and worker.
6. Add a deployment plan with domain, HTTPS, health checks, rollback, and worker process.
7. Draft the legal/compliance launch packet checklist.
8. Add file upload/storage design for field reports and client portal assets.
9. Build a production activation test plan for auth, tenant isolation, uploads, AI review, portal
visibility, worker retries, backup restore, and deployment rollback.
10. Create the real AI runtime/evaluation plan with provider selection, prompt registry, cost
tracking, human review, and fallback rules.
