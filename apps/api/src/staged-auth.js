// Shared staged authentication helpers.
//
// STAGED ONLY — READ BEFORE HARDENING:
// Tenant scope is *self-asserted* by the caller via the `x-staged-tenant-id`
// header (or the `stagedTenantId` query param for the SSE stream, where
// EventSource cannot set request headers). There is no credential, token, or
// session — access is granted purely when the asserted tenant equals the
// requested tenant. This is acceptable only for synthetic staged data and MUST
// be replaced with real tenant authn/authz before activation. See the
// "tenant isolation verification completed" item in
// docs/activation/activation-checklist.md and docs/security/staged-mode-policy.md.

export function extractStagedAuth({ headers = {}, searchParams = null } = {}) {
  const tenantId =
    headers["x-staged-tenant-id"] ??
    headers["X-Staged-Tenant-Id"] ??
    (searchParams ? searchParams.get("stagedTenantId") : null) ??
    null;

  const userId = headers["x-staged-user-id"] ?? headers["X-Staged-User-Id"] ?? "synthetic-user";

  return { tenantId, userId };
}

// REST callers pass only headers (query param is intentionally NOT consulted, so
// `?stagedTenantId=` cannot broaden REST access). The SSE transport passes
// searchParams because EventSource cannot send headers.
export function canAccessTenant({ headers = {}, searchParams = null, tenantId }) {
  return extractStagedAuth({ headers, searchParams }).tenantId === tenantId;
}
