import { AuthError, verifyJwt } from "./jwt.js";

const PAID_CLIENT_ROLES = new Set(["xygo_admin", "client_owner", "client_staff", "client_viewer"]);

// A Principal is the validated (or, in staged mode, self-asserted) identity used
// for every authorization decision downstream:
//   { userId, tenantId, organizationRole, projectRole, authenticated, staged }

// Staged mode: self-asserted identity from headers / query. NON-PRODUCTION.
// Grants a broad org role so existing staged workflows exercise the RBAC path
// without a real IdP, but is explicitly flagged authenticated:false / staged:true.
export function resolveStagedPrincipal({ headers = {}, searchParams = null } = {}) {
  const tenantId =
    headers["x-staged-tenant-id"] ??
    headers["X-Staged-Tenant-Id"] ??
    (searchParams ? searchParams.get("stagedTenantId") : null) ??
    null;

  const userId = headers["x-staged-user-id"] ?? headers["X-Staged-User-Id"] ?? "synthetic-user";

  return {
    userId,
    tenantId,
    organizationRole: "company_admin",
    projectRole: null,
    authenticated: false,
    staged: true
  };
}

function extractBearer(headers = {}) {
  const header = headers.authorization ?? headers.Authorization ?? null;
  if (header && /^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, "").trim();
  }
  return null;
}

// OIDC mode: verify a managed-IdP JWT, then resolve tenant and role from the
// canonical repository. Token-provided tenant/role claims are never trusted for
// authorization decisions.
export async function resolveOidcPrincipal({
  headers = {},
  searchParams = null,
  jwks,
  config,
  repository,
  allowQueryAuth = false,
  now = Date.now()
}) {
  const token = extractBearer(headers);
  if (!token) {
    throw new AuthError("missing_token", "Authorization bearer token is required.");
  }

  const keys = await jwks.getKeys({ now });
  const claims = verifyJwt(token, {
    keys,
    issuer: config.oidc.issuer,
    audience: config.oidc.audience,
    allowedAlgorithms: config.oidc.allowedAlgorithms,
    now,
    clockToleranceSec: config.oidc.clockToleranceSec
  });

  const subject = typeof claims.sub === "string" ? claims.sub.trim() : "";
  if (!subject) {
    throw new AuthError("missing_subject", "Token is missing the OIDC subject claim (sub).");
  }

  if (!repository?.resolveOidcAuthorization) {
    throw new AuthError("config_error", "OIDC mode requires canonical PostgreSQL identity resolution.");
  }

  const authorization = await repository.resolveOidcAuthorization({
    issuer: config.oidc.issuer,
    subject
  });

  if (authorization?.status === "ambiguous") {
    throw new AuthError("identity_ambiguous", "OIDC identity resolved to multiple authorization records.");
  }
  if (authorization?.status !== "active") {
    throw new AuthError("identity_not_provisioned", "OIDC identity is not active in the canonical repository.");
  }
  if (
    typeof authorization.userId !== "string" || !authorization.userId ||
    typeof authorization.tenantId !== "string" || !authorization.tenantId ||
    !PAID_CLIENT_ROLES.has(authorization.organizationRole)
  ) {
    throw new AuthError("identity_invalid", "OIDC identity has an invalid canonical authorization assignment.");
  }

  return {
    userId: authorization.userId,
    tenantId: authorization.tenantId,
    organizationRole: authorization.organizationRole,
    projectRole: authorization.projectRole ?? null,
    authenticated: true,
    staged: false
  };
}

// Unified entry used by the server. Returns a Principal or throws AuthError.
export async function resolvePrincipal({
  headers = {},
  searchParams = null,
  config,
  jwks,
  repository,
  allowQueryAuth = false,
  now = Date.now()
}) {
  if (config.mode === "oidc") {
    return resolveOidcPrincipal({ headers, searchParams, jwks, config, repository, allowQueryAuth, now });
  }
  return resolveStagedPrincipal({ headers, searchParams: allowQueryAuth ? searchParams : null });
}
