const MANAGED_OIDC_PROVIDERS = new Set([
  "auth0",
  "clerk",
  "cognito",
  "entra",
  "okta",
  "other-managed-oidc"
]);

function normalizedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stagedModeEnabled(value) {
  if (value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  throw new Error("STAGED_MODE must be true or false.");
}

function assertHttpsUrl(value, label, { allowQuery = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash || (!allowQuery && url.search)) {
    throw new Error(`${label} must be an HTTPS URL without credentials, a fragment, or unsupported URL components.`);
  }
}

export function loadWebRuntimeConfig(env = process.env) {
  const mode = normalizedString(env.XYGO_AUTH_MODE) ?? "staged";
  const productionMode = String(env.NODE_ENV ?? "").trim().toLowerCase() === "production" || !stagedModeEnabled(env.STAGED_MODE);
  const appUrl = normalizedString(env.XYGO_WEB_APP_URL) ?? "http://127.0.0.1:4173";
  const apiBaseUrl = normalizedString(env.XYGO_WEB_API_BASE_URL) ?? "http://127.0.0.1:3000";

  const config = {
    productionMode,
    appUrl,
    apiBaseUrl,
    auth: { mode }
  };

  if (mode === "oidc") {
    const scopes = (normalizedString(env.XYGO_WEB_OIDC_SCOPES) ?? "openid profile email")
      .split(/\s+/)
      .filter(Boolean);
    config.auth = {
      mode,
      provider: normalizedString(env.XYGO_OIDC_PROVIDER),
      issuer: normalizedString(env.XYGO_OIDC_ISSUER),
      audience: normalizedString(env.XYGO_OIDC_AUDIENCE),
      clientId: normalizedString(env.XYGO_WEB_OIDC_CLIENT_ID),
      authorizationEndpoint: normalizedString(env.XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT),
      tokenEndpoint: normalizedString(env.XYGO_WEB_OIDC_TOKEN_ENDPOINT),
      endSessionEndpoint: normalizedString(env.XYGO_WEB_OIDC_END_SESSION_ENDPOINT),
      scopes,
      responseType: "code",
      pkceMethod: "S256",
      redirectUri: `${appUrl.replace(/\/$/, "")}/auth/callback`,
      postLogoutRedirectUri: `${appUrl.replace(/\/$/, "")}/`,
      accessTokenStorage: "memory"
    };
  }

  return config;
}

export function assertWebRuntimeConfig(config, env = process.env) {
  if (normalizedString(env.XYGO_WEB_OIDC_CLIENT_SECRET)) {
    throw new Error("XYGO_WEB_OIDC_CLIENT_SECRET is forbidden: the browser must use Authorization Code + PKCE as a public client.");
  }
  if (config.productionMode && config.auth.mode !== "oidc") {
    throw new Error("Production web runtime requires XYGO_AUTH_MODE=oidc; staged headers are not a production sign-in method.");
  }
  if (config.auth.mode !== "staged" && config.auth.mode !== "oidc") {
    throw new Error(`Unknown XYGO_AUTH_MODE: ${config.auth.mode}.`);
  }
  if (config.auth.mode === "staged") return config;

  const required = [
    [config.auth.provider, "XYGO_OIDC_PROVIDER"],
    [config.auth.issuer, "XYGO_OIDC_ISSUER"],
    [config.auth.audience, "XYGO_OIDC_AUDIENCE"],
    [config.auth.clientId, "XYGO_WEB_OIDC_CLIENT_ID"],
    [config.auth.authorizationEndpoint, "XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT"],
    [config.auth.tokenEndpoint, "XYGO_WEB_OIDC_TOKEN_ENDPOINT"],
    [config.auth.endSessionEndpoint, "XYGO_WEB_OIDC_END_SESSION_ENDPOINT"]
  ];
  const missing = required.filter(([value]) => !value).map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`OIDC web runtime is missing required settings: ${missing.join(", ")}.`);
  }
  if (!MANAGED_OIDC_PROVIDERS.has(config.auth.provider)) {
    throw new Error(`Unsupported XYGO_OIDC_PROVIDER: ${config.auth.provider}.`);
  }
  if (!config.auth.scopes.includes("openid")) {
    throw new Error("XYGO_WEB_OIDC_SCOPES must include openid.");
  }

  if (config.productionMode) {
    for (const [value, label, allowQuery] of [
      [config.appUrl, "XYGO_WEB_APP_URL", false],
      [config.apiBaseUrl, "XYGO_WEB_API_BASE_URL", false],
      [config.auth.issuer, "XYGO_OIDC_ISSUER", false],
      [config.auth.authorizationEndpoint, "XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT", true],
      [config.auth.tokenEndpoint, "XYGO_WEB_OIDC_TOKEN_ENDPOINT", true],
      [config.auth.endSessionEndpoint, "XYGO_WEB_OIDC_END_SESSION_ENDPOINT", true]
    ]) {
      assertHttpsUrl(value, label, { allowQuery });
    }
  }
  return config;
}

export function publicWebRuntimeConfig(config) {
  return {
    appUrl: config.appUrl,
    apiBaseUrl: config.apiBaseUrl,
    auth: config.auth.mode === "staged" ? { mode: "staged" } : {
      mode: config.auth.mode,
      provider: config.auth.provider,
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      clientId: config.auth.clientId,
      authorizationEndpoint: config.auth.authorizationEndpoint,
      tokenEndpoint: config.auth.tokenEndpoint,
      endSessionEndpoint: config.auth.endSessionEndpoint,
      scopes: [...config.auth.scopes],
      responseType: config.auth.responseType,
      pkceMethod: config.auth.pkceMethod,
      redirectUri: config.auth.redirectUri,
      postLogoutRedirectUri: config.auth.postLogoutRedirectUri,
      accessTokenStorage: config.auth.accessTokenStorage
    }
  };
}
