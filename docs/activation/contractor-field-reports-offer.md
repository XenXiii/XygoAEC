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

The commercial model is a one-time fixed activation fee plus a monthly managed-service fee, quoted
on the signed order form. The activation fee covers the included scope. The monthly fee covers the
configured tenant, routine support, and agreed usage allowance. Additional users, projects, storage,
integrations, or custom workflows require a written change order. No price is implied by this repo.

## Acceptance Criteria

The client accepts the staged activation when an authorized client owner can sign in using the
approved staging method; roles and tenant boundaries pass the test plan; a staff user can capture a
sample report; an authorized reviewer can approve it; only that approved report appears in the
correct branded portal; the client completes the demo script; and open production blockers are
recorded and acknowledged.

## Demo Script

1. Sign in as client staff and open the starter project.
2. Capture a synthetic daily log with a note, photo placeholder, and checklist item.
3. Generate the simulated draft and show that it is not client-visible.
4. Sign in as the client owner, review the draft, and approve it.
5. Open the client portal and confirm the approved report appears.
6. Switch to a second staged tenant and confirm the first tenant's project and report do not appear.
7. Show the audit/provisioning record and the external-write kill switch.

## Change Control And Safety

Client data must not be committed to the repository. Client-visible generated content always requires
human approval. Live integrations and production activation require explicit written approval, a
validated kill switch, and completion of `activation-checklist.md`.
