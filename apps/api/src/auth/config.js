import { AuthError } from "./jwt.js";

const SUPPORTED_OIDC_ALGORITHMS = new Set(["RS256", "RS384", "RS512"]);
const SUPPORTED_OIDC_PROVIDERS = new Set([
  "auth0",
  "clerk",
  "cognito",
  "entra",
  "google",
  "okta",
  "other-managed-oidc"
]);
const MAX_CLOCK_TOLERANCE_SEC = 300;

function normalizedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseStagedMode(value) {
  if (value === undefined) return true;
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new AuthError("config_error", "STAGED_MODE must be true or false.");
}

function assertHttpsUrl(value, label, { allowQuery = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AuthError("config_error", `${label} must be an absolute HTTPS URL in production.`);
  }
  if (url.protocol !== "https:") {
    throw new AuthError("unsafe_config", `${label} must use HTTPS in production.`);
  }
  if (!url.hostname || url.username || url.password || url.hash || (!allowQuery && url.search)) {
    throw new AuthError(
      "unsafe_config",
      `${label} must not contain credentials, a fragment, or unsupported URL components.`
    );
  }
}

// Build the auth configuration from environment. Two modes:
//  - "staged"  (default): self-asserted tenant header. NON-PRODUCTION.
//  - "oidc": verify managed-IdP JWTs (Auth0/Clerk/Cognito) via JWKS.
export function loadAuthConfig(env = process.env) {
  const mode = env.XYGO_AUTH_MODE ?? "staged";

  if (mode !== "staged" && mode !== "oidc") {
    throw new Error(`Unknown XYGO_AUTH_MODE: ${mode} (expected "staged" or "oidc").`);
  }

  const stagedModeEnabled = parseStagedMode(env.STAGED_MODE);
  const productionMode = String(env.NODE_ENV ?? "").trim().toLowerCase() === "production" || !stagedModeEnabled;

  const config = {
    mode,
    stagedModeEnabled,
    productionMode,
    oidc: null
  };

  if (mode === "oidc") {
    const issuer = normalizedString(env.XYGO_OIDC_ISSUER);
    const audience = normalizedString(env.XYGO_OIDC_AUDIENCE);
    const configuredJwksUri = normalizedString(env.XYGO_OIDC_JWKS_URI);
    const configuredAlgorithms = normalizedString(env.XYGO_OIDC_ALLOWED_ALGORITHMS) ?? "RS256";
    config.oidc = {
      provider: normalizedString(env.XYGO_OIDC_PROVIDER),
      issuer,
      audience,
      jwksUri: configuredJwksUri ?? (issuer ? `${issuer.replace(/\/$/, "")}/.well-known/jwks.json` : null),
      jwksUriExplicit: Boolean(configuredJwksUri),
      allowedAlgorithms: configuredAlgorithms.split(",").map((value) => value.trim()).filter(Boolean),
      clockToleranceSec: Number(env.XYGO_OIDC_CLOCK_TOLERANCE_SEC ?? 60)
    };
  }

  return config;
}

// Startup safety gate (B3): the runtime must not silently run in an inconsistent
// trust posture. Called before the server starts accepting requests.
export function assertAuthConfig(config, { repositoryMode = null } = {}) {
  if (config.productionMode && config.mode !== "oidc") {
    throw new AuthError(
      "unsafe_config",
      "Production mode requires XYGO_AUTH_MODE=oidc; staged identity cannot be enabled."
    );
  }

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
    if (
      !Array.isArray(config.oidc.allowedAlgorithms) ||
      config.oidc.allowedAlgorithms.length === 0 ||
      config.oidc.allowedAlgorithms.some((algorithm) => !SUPPORTED_OIDC_ALGORITHMS.has(algorithm))
    ) {
      throw new AuthError(
        "config_error",
        "XYGO_OIDC_ALLOWED_ALGORITHMS must contain one or more supported RSA algorithms."
      );
    }
    if (
      !Number.isFinite(config.oidc.clockToleranceSec) ||
      config.oidc.clockToleranceSec < 0 ||
      config.oidc.clockToleranceSec > MAX_CLOCK_TOLERANCE_SEC
    ) {
      throw new AuthError(
        "config_error",
        `XYGO_OIDC_CLOCK_TOLERANCE_SEC must be between 0 and ${MAX_CLOCK_TOLERANCE_SEC}.`
      );
    }
    if (config.productionMode) {
      if (!config.oidc.provider || !SUPPORTED_OIDC_PROVIDERS.has(config.oidc.provider)) {
        throw new AuthError(
          "config_error",
          `Production OIDC requires XYGO_OIDC_PROVIDER to be one of: ${[...SUPPORTED_OIDC_PROVIDERS].join(", ")}.`
        );
      }
      if (!config.oidc.jwksUriExplicit) {
        throw new AuthError(
          "config_error",
          "Production OIDC requires an explicit XYGO_OIDC_JWKS_URI; an inferred provider endpoint is not accepted."
        );
      }
      assertHttpsUrl(config.oidc.issuer, "XYGO_OIDC_ISSUER");
      assertHttpsUrl(config.oidc.jwksUri, "XYGO_OIDC_JWKS_URI", { allowQuery: true });
    }
    if (repositoryMode !== "postgres") {
      throw new AuthError(
        "unsafe_config",
        "XYGO_AUTH_MODE=oidc requires XYGO_API_REPOSITORY_MODE=postgres for canonical tenant and role resolution."
      );
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
