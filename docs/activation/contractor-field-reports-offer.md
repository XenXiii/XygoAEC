# Contractor Field Reports + Client Portal — First Paid Offer

## Outcome

Xygo configures a staged, tenant-isolated workflow that turns contractor field notes, photo
placeholders, and checklist observations into human-reviewed reports published in a branded client
portal. The first engagement is a fixed-scope activation; production launch remains subject to the
activation checklist and written approval.

## Included Scope And Deliverables

- One client tenant, business profile, branded portal configuration, and starter project.
- Up to one owner and five staff/viewer role assignments.
- Contractor daily-log and progress-report templates.
- Deterministic draft generation with mandatory human review; only approved reports are visible.
- One onboarding workshop, one operator training session, and documented handoff.
- Staging acceptance test and a launch-readiness findings report.

## Exclusions

- Production identity-provider, hosting, storage, or third-party integration fees.
- Live AI generation, unattended publication, live external writes, custom mobile apps, payments,
  data migration, legal advice, or work outside the agreed report/portal workflow.
- Production activation before security, privacy, legal, deployment, and rollback gates are approved.

## Pricing Model

The commercial model is a one-time fixed activation fee plus a monthly managed-service fee. The
signed order form is the only pricing authority and must state the exact amounts, currency, taxes,
invoice timing, payment terms, monthly billing start date, initial term, renewal/cancellation terms,
and included usage allowance. The activation fee covers only the deliverables in Included Scope. The
monthly fee covers the configured tenant and Routine Support below. This repository is neither a
quote nor an order form and does not establish a price or payment obligation.

## Routine Support And Change Orders

Routine Support means remote troubleshooting of the configured field-report and portal workflow,
correction of reproducible defects in that configured scope, reasonable user-access administration,
and answers to operator questions during the support hours and response targets stated in the signed
order form. It does not include guaranteed uptime or a response time unless the order form expressly
states one.

A written change order, accepted before work begins, is required for another tenant; more than the
included six users; additional projects, templates, storage, or usage; data migration; new reports,
features, roles, integrations, or workflow changes; production activation work; on-site training; or
after-hours/expedited support. The change order must state scope, fee, schedule, and acceptance
criteria. Defect correction within the accepted configured scope is Routine Support, not a change
order.

## Approved Staging Sign-In Method

Staging does not have real sign-in or verified user identity. For synthetic-data acceptance only, the
approved method is to run with `XYGO_AUTH_MODE=staged` (the default) and send the provisioned tenant
ID in the `x-staged-tenant-id` request header; `x-staged-user-id` may identify the synthetic operator.
The browser demo supplies those headers. They are self-asserted, provide no credential or session,
and must never be used with private client data or treated as production authentication. Paid
production use requires `XYGO_AUTH_MODE=oidc` and completion of the authentication activation gate.

## Acceptance Criteria

The client accepts the staged activation when a designated client owner can access the synthetic
tenant using the Approved Staging Sign-In Method; roles and tenant boundaries pass the test plan; a
staff operator can capture a sample report; a designated reviewer can approve it; only that approved
report appears in the correct branded portal; the client completes the demo script; and open
production blockers are recorded and acknowledged. Staging acceptance does not certify real
authentication or authorize production use.

## Demo Script

1. Sign in as client staff and open the starter project.
2. Capture a synthetic daily log with a note, photo placeholder, and checklist item.
3. Generate the simulated draft and show that it is not client-visible.
4. Sign in as the client owner, review the draft, and approve it.
5. Open the client portal and confirm the approved report appears.
6. Switch to a second staged tenant and confirm the first tenant's project and report do not appear.
7. Show the audit/provisioning record and collect the External-Write Kill-Switch Evidence below.

## External-Write Kill-Switch Evidence

For this staged offer, the kill switch is the fail-closed code path, not an operator-controlled
environment toggle. Evidence is all of the following:

1. Run `node --test packages/staged-mode/test/policy.test.js` and retain the passing output for
   `staged mode cannot be disabled`, `production targets are blocked`, `live credential patterns are
   blocked`, and `outbound write methods are blocked in staged mode`.
2. Run `node --test packages/integrations/test/index.test.js` and retain the passing output for
   `provider adapters keep live writes disabled`.
3. Record the reviewed commit hash for `packages/staged-mode/src/policy.js`, where
   `assertStagedOutboundOperation` rejects outbound methods other than `GET` and `HEAD`, and for
   `packages/integrations/src/index.js`, where `createFolder`, `uploadFile`, and `publishModel` throw
   instead of calling providers.

Any future code path capable of an external write requires a separately reviewed kill switch and
test evidence; the evidence above must not be generalized to a new adapter or deployment.

## Change Control And Safety

Client data must not be committed to the repository. Client-visible generated content always requires
human approval. Live integrations and production activation require explicit written approval, a
validated path-specific kill switch, and completion of `activation-checklist.md`.
