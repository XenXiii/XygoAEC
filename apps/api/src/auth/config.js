import { AuthError } from "./jwt.js";

// Build the auth configuration from environment. Two modes:
//  - "staged"  (default): self-asserted tenant header. NON-PRODUCTION.
//  - "oidc": verify managed-IdP JWTs (Auth0/Clerk/Cognito) via JWKS.
export function loadAuthConfig(env = process.env) {
  const mode = env.XYGO_AUTH_MODE ?? "staged";

  if (mode !== "staged" && mode !== "oidc") {
    throw new Error(`Unknown XYGO_AUTH_MODE: ${mode} (expected "staged" or "oidc").`);
  }

  const stagedModeEnabled = env.STAGED_MODE !== "false" && env.STAGED_MODE !== false;

  const config = {
    mode,
    stagedModeEnabled,
    oidc: null
  };

  if (mode === "oidc") {
    const issuer = env.XYGO_OIDC_ISSUER ?? null;
    const audience = env.XYGO_OIDC_AUDIENCE ?? null;
    config.oidc = {
      issuer,
      audience,
      jwksUri: env.XYGO_OIDC_JWKS_URI ?? (issuer ? `${issuer.replace(/\/$/, "")}/.well-known/jwks.json` : null),
      tenantClaim: env.XYGO_OIDC_TENANT_CLAIM ?? "org_id",
      rolesClaim: env.XYGO_OIDC_ROLES_CLAIM ?? "https://xygo/org_role",
      projectRoleClaim: env.XYGO_OIDC_PROJECT_ROLE_CLAIM ?? "https://xygo/project_role",
      clockToleranceSec: Number(env.XYGO_OIDC_CLOCK_TOLERANCE_SEC ?? 60)
    };
  }

  return config;
}

// Startup safety gate (B3): the runtime must not silently run in an inconsistent
// trust posture. Called before the server starts accepting requests.
export function assertAuthConfig(config) {
  if (config.mode === "oidc") {
    if (!config.oidc?.issuer || !config.oidc?.audience) {
      throw new AuthError(
        "config_error",
        "XYGO_AUTH_MODE=oidc requires XYGO_OIDC_ISSUER and XYGO_OIDC_AUDIENCE."
      );
    }
    if (!config.oidc.jwksUri) {
      throw new AuthError("config_error", "OIDC mode requires a resolvable JWKS URI.");
    }
    return;
  }

  // mode === "staged": self-asserted identity is only permissible while STAGED_MODE
  // is on. Refuse to boot the staged trust model with production mode requested.
  if (!config.stagedModeEnabled) {
    throw new AuthError(
      "unsafe_config",
      "STAGED_MODE=false requires XYGO_AUTH_MODE=oidc: self-asserted tenant identity cannot run in production mode."
    );
  }
}
