# Codex Build Brief: Xygo V2 Paid-Client Activation

Use this file as the starting prompt for Codex when continuing the Xygo V2 build.

## Source Files To Read First

1. `docs/xygo-2.0-build-report.md`
2. `docs/activation/xygo-v2-paid-client-gap-list.md`
3. `docs/activation/activation-checklist.md`
4. `docs/api/openapi.v1.json`
5. `package.json`

## Working Instruction

Read the source files above. Complete the remaining Xygo V2 paid-client activation tasks in priority
order. Implement code changes, add tests, run `npm test`, and update docs as each task is completed.

Do not remove staged guardrails unless replacing them with production-safe authentication, tenant
isolation, secret management, deployment controls, monitoring, and tests.

## First Execution Slice

Status: completed in the paid-client activation first slice. The offer and onboarding checklist are
documented, and `npm run provision:tenant` creates the staged tenant foundation with idempotency and
tenant-isolation tests. Production activation remains blocked by the non-negotiable launch gates.

Start with paid-client activation documentation and provisioning:

1. Write the first paid offer spec for Contractor Field Reports + Client Portal.
2. Create the first-client onboarding checklist.
3. Create a tenant provisioning script or admin command.
4. Add tests for the provisioning path.
5. Run `npm test`.
6. Update this brief and the gap list with completed status.

## Success Criteria For The First Slice

- A paid offer spec exists and names scope, deliverables, exclusions, acceptance criteria, and pricing
model.
- A first-client onboarding checklist exists and can be used without reading unrelated repo docs.
- A provisioning script or admin command can create a staged tenant, project, roles, blueprint, and
starter portal data without manual fixture edits.
- Tests cover provisioning idempotency and tenant isolation.
- `npm test` passes.

## Non-Negotiables

- No private customer data in fixtures.
- No production credentials in repo.
- No live external writes without a kill switch and explicit activation approval.
- No client-visible AI output without human review.
- No cross-tenant access.
