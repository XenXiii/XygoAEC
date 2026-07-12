import { AuthError, verifyJwt } from "./jwt.js";

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

function extractBearer(headers = {}, searchParams = null) {
  const header = headers.authorization ?? headers.Authorization ?? null;
  if (header && /^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, "").trim();
  }
  // EventSource cannot set headers; allow the token via query for the SSE stream.
  if (searchParams) {
    return searchParams.get("access_token");
  }
  return null;
}

// OIDC mode: verify a managed-IdP JWT and map claims to a Principal.
export async function resolveOidcPrincipal({ headers = {}, searchParams = null, jwks, config, now = Date.now() }) {
  const token = extractBearer(headers, searchParams);
  if (!token) {
    throw new AuthError("missing_token", "Authorization bearer token is required.");
  }

  const keys = await jwks.getKeys({ now });
  const claims = verifyJwt(token, {
    keys,
    issuer: config.oidc.issuer,
    audience: config.oidc.audience,
    now,
    clockToleranceSec: config.oidc.clockToleranceSec
  });

  const tenantId = claims[config.oidc.tenantClaim] ?? null;
  if (!tenantId) {
    throw new AuthError("missing_tenant_claim", `Token is missing the tenant claim (${config.oidc.tenantClaim}).`);
  }

  return {
    userId: claims.sub ?? null,
    tenantId,
    organizationRole: claims[config.oidc.rolesClaim] ?? null,
    projectRole: claims[config.oidc.projectRoleClaim] ?? null,
    authenticated: true,
    staged: false
  };
}

// Unified entry used by the server. Returns a Principal or throws AuthError.
export async function resolvePrincipal({ headers = {}, searchParams = null, config, jwks, now = Date.now() }) {
  if (config.mode === "oidc") {
    return resolveOidcPrincipal({ headers, searchParams, jwks, config, now });
  }
  return resolveStagedPrincipal({ headers, searchParams });
}
