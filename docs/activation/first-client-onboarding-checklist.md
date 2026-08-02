# First-Client Onboarding Checklist

This checklist is self-contained for the Contractor Field Reports + Client Portal engagement. Keep
client secrets and private data in approved systems, never in Git or fixtures.

## Before Provisioning

- [ ] Signed order form identifies scope, fees, client owner, and acceptance authority.
- [ ] Privacy, retention, incident, support, AI/human-review, and data-processing terms are approved.
- [ ] Confirm staging-only status and record who may approve production activation.
- [ ] Collect business/brand name, approved color, starter project name, and user names/emails through
      an approved secure channel.
- [ ] Assign each user exactly one initial role: `client_owner`, `client_staff`, or `client_viewer`.
- [ ] Confirm at least one `client_owner`; reserve `xygo_admin` for authorized Xygo operators.

## Provision The Staged Account

1. Create a local JSON input outside the repository:

   ```json
   {
     "staged": true,
     "slug": "client-slug",
     "businessName": "Client Business",
     "projectName": "Starter Project",
     "brandName": "Client Brand",
     "primaryColor": "#17324d",
     "users": [
       { "email": "owner@example.invalid", "displayName": "Client Owner", "role": "client_owner" }
     ]
   }
   ```

2. Run `npm run provision:tenant -- --config /secure/path/client.json --approve-staged`.
3. Save the printed tenant, project, and blueprint IDs in the approved client operations record.
4. Re-run the same command and confirm `"created": false`; any changed input must fail instead of
   silently altering the tenant.

## Configure And Validate

- [ ] Verify tenant, users, roles, business profile, starter project, blueprint, and portal data exist.
- [ ] Confirm the blueprint includes `field_reporting` and `client_portal`.
- [ ] Confirm portal configuration has `approvedContentOnly: true`.
- [ ] Test owner, staff, and viewer permissions; viewers cannot create, draft, review, or approve.
- [ ] Run a cross-tenant isolation test with a separate synthetic tenant.
- [ ] Complete the offer demo script using synthetic data only.
- [ ] Confirm a draft is hidden and becomes visible only after human approval.
- [ ] Run `npm test` and attach the result to the onboarding record.

## Training And Acceptance

- [ ] Train staff on capture, draft generation, review, corrections, approval, and portal visibility.
- [ ] Train the owner on user access, escalation, and offboarding requests.
- [ ] Provide support contact, response expectations, incident contact, and known limitations.
- [ ] Client acceptance authority completes and signs the acceptance criteria.
- [ ] Record unresolved production blockers; do not represent staging acceptance as production launch.

## Production Activation Gate

- [ ] Complete every item in `activation-checklist.md` with evidence and an owner.
- [ ] Validate real authentication, managed Postgres, secrets, HTTPS, backups, monitoring, and rollback.
- [ ] Validate external-write kill switches and human-review gates.
- [ ] Obtain explicit written production activation approval.

## Handoff And Follow-Up

- [ ] Store configuration and credentials in approved systems; remove temporary local client files.
- [ ] Schedule the first-week check-in and monthly service review.
- [ ] Record enhancement requests as change orders, not silent scope expansion.
- [ ] On offboarding, disable access, export/return data as agreed, apply retention terms, and record
      completion.
