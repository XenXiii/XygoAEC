# Staged-Mode Policy

## Objective

Xygo must remain in staged mode until a separate future activation process is approved. Missing or ambiguous configuration must fail closed.

## Hard Requirements

- `STAGED_MODE=true` by default
- server-side enforcement only
- no client-side bypass
- outbound production targets denied
- live credential patterns denied
- policy violations logged with timestamps and context
- live personal, financial, or project data rejected

## Policy Controls

### Configuration

- missing config means staged mode remains enabled
- explicit disabling is not supported in current code

### Outbound control

- allowlist only for official documentation retrieval during research
- deny all outbound write-capable targets
- deny known production hostnames

### Credentials

- reject values that look like live tokens, secrets, or production endpoints in staged operations

### UX

- every future user-facing surface must show `STAGED / SIMULATED DATA`

## Known Staged Limitation: Self-Asserted Tenant Scope

Tenant isolation in the staged API is **self-asserted and unauthenticated**. Access is granted
when the caller-supplied `x-staged-tenant-id` header (or the `stagedTenantId` query param on the
SSE stream) equals the requested `{tenantId}` path segment. There is no credential, token, or
session — any caller can reach any tenant by asserting that tenant's id.

This is acceptable for synthetic staged data only. Real tenant authn/authz MUST be implemented
before the `tenant isolation verification completed` item in
`docs/activation/activation-checklist.md` may be checked. The single enforcement point is
`apps/api/src/staged-auth.js`, and the gate is pinned by
`apps/api/test/staged-auth.test.js`.

## Phase 0 Working Enforcement

Current code module:
- `packages/staged-mode/src/policy.js`

Current tests:
- default staged mode
- production hostname blocking
- outbound write blocking
- live-credential pattern blocking
- policy-violation capture
