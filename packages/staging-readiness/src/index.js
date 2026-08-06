import {
  assertProductionApiEnvironment,
  assertProductionWebEnvironment,
  assertProductionWorkerEnvironment,
  PRIVATE_PRODUCTION_ENV_VARS
} from "../../production-config/src/index.js";
import { loadWebRuntimeConfig } from "../../../apps/web/src/runtime-config.js";

const requiredControls = Object.freeze([
  "XYGO_STAGING_WEB_HOST",
  "XYGO_STAGING_API_HOST",
  "XYGO_STAGING_IDP_CALLBACK_URL",
  "XYGO_STAGING_IDP_LOGOUT_URL",
  "XYGO_STAGING_INGRESS_FORWARDED_PROTO",
  "XYGO_STAGING_TLS_MIN_VERSION",
  "XYGO_STAGING_HSTS_MAX_AGE",
  "XYGO_STAGING_CACHE_AUTHENTICATED",
  "XYGO_STAGING_REDACT_AUTHORIZATION",
  "XYGO_STAGING_REDACT_COOKIE",
  "XYGO_STAGING_REDACT_QUERY_STRINGS"
]);

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for staging deployment`);
  return value;
}

function expect(value, expected, message) {
  if (value !== expected) throw new Error(message);
}

function headerValue(config, source, key) {
  const route = config.headers?.find((entry) => entry.source === source);
  return route?.headers?.find((header) => header.key.toLowerCase() === key.toLowerCase())?.value;
}

export function assertStagingDeploymentReadiness({ env, vercelConfig, serviceWorkerSource, migrationVersions }) {
  assertProductionApiEnvironment(env);
  assertProductionWebEnvironment(env);
  assertProductionWorkerEnvironment(env);
  const runtimeConfig = loadWebRuntimeConfig(env);
  expect(env.XYGO_DEPLOY_ENVIRONMENT, "staging", "XYGO_DEPLOY_ENVIRONMENT must be staging");
  requiredControls.forEach((name) => required(env, name));

  const appUrl = new URL(runtimeConfig.appUrl);
  const apiUrl = new URL(runtimeConfig.apiBaseUrl);
  expect(appUrl.pathname, "/", "XYGO_WEB_APP_URL must be an origin without a path");
  expect(apiUrl.pathname, "/", "XYGO_WEB_API_BASE_URL must be an origin without a path");
  expect(appUrl.hostname, env.XYGO_STAGING_WEB_HOST, "staging web host must match XYGO_WEB_APP_URL");
  expect(apiUrl.hostname, env.XYGO_STAGING_API_HOST, "staging API host must match XYGO_WEB_API_BASE_URL");
  expect(env.XYGO_STAGING_IDP_CALLBACK_URL, `${appUrl.origin}/auth/callback`, "IdP callback must exactly match the HTTPS web callback");
  expect(env.XYGO_STAGING_IDP_LOGOUT_URL, `${appUrl.origin}/`, "IdP logout URL must exactly match the configured HTTPS post-logout route");
  expect(env.XYGO_STAGING_INGRESS_FORWARDED_PROTO, "https", "ingress must forward the original HTTPS protocol");
  if (!new Set(["1.2", "1.3"]).has(env.XYGO_STAGING_TLS_MIN_VERSION)) throw new Error("staging TLS minimum must be 1.2 or 1.3");
  const hsts = Number(env.XYGO_STAGING_HSTS_MAX_AGE);
  if (!Number.isInteger(hsts) || hsts < 86400 || hsts > 63072000) throw new Error("staging HSTS max-age must be between 86400 and 63072000 seconds");
  expect(env.XYGO_STAGING_CACHE_AUTHENTICATED, "false", "ingress/CDN caching of authenticated responses must be disabled");
  for (const name of ["XYGO_STAGING_REDACT_AUTHORIZATION", "XYGO_STAGING_REDACT_COOKIE", "XYGO_STAGING_REDACT_QUERY_STRINGS"]) {
    expect(env[name], "true", `${name} must be true`);
  }

  expect(headerValue(vercelConfig, "/runtime-config.json", "Cache-Control"), "private, no-store", "runtime config must be private, no-store");
  expect(headerValue(vercelConfig, "/service-worker.js", "Cache-Control"), "no-cache", "service worker must be revalidated");
  expect(headerValue(vercelConfig, "/service-worker.js", "Service-Worker-Allowed"), "/", "service worker scope must be explicit");
  expect(headerValue(vercelConfig, "/manifest.webmanifest", "Cache-Control"), "no-cache", "manifest must be revalidated");

  for (const marker of ["/auth/", "/v1/", "/runtime-config.json", "request.method !== \"GET\"", "url.origin !== self.location.origin"]) {
    if (!serviceWorkerSource.includes(marker)) throw new Error(`service worker is missing safe cache boundary: ${marker}`);
  }
  for (const version of ["0003_oidc_authorization", "0008_web_auth_sessions"]) {
    if (!migrationVersions.includes(version)) throw new Error(`required PostgreSQL migration is missing: ${version}`);
  }

  return Object.freeze({
    deployEnvironment: "staging",
    release: runtimeConfig.release,
    webOrigin: appUrl.origin,
    apiOrigin: apiUrl.origin,
    sessionStore: "postgres",
    cacheAuthenticated: false
  });
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}`);
}

function assertCache(response, expected, label) {
  const value = response.headers.get("cache-control") ?? "";
  if (!value.toLowerCase().includes(expected)) throw new Error(`${label}: Cache-Control must include ${expected}`);
}

async function body(response, label) {
  try { return await response.json(); } catch { throw new Error(`${label}: expected JSON response`); }
}

export async function runStagingSmoke({ baseUrl, expectedRelease, tenantId, deniedTenantId, accessToken, fetchImpl = fetch }) {
  const origin = new URL(baseUrl);
  if (origin.protocol !== "https:" || origin.pathname !== "/") throw new Error("XYGO_STAGING_BASE_URL must be an HTTPS origin");
  const get = (path, init) => fetchImpl(new URL(path, origin), { redirect: "manual", ...init });
  const checks = [];

  let response = await get("/runtime-config.json");
  assertStatus(response, 200, "runtime config");
  assertCache(response, "no-store", "runtime config");
  const runtime = await body(response, "runtime config");
  expect(runtime.appUrl, origin.origin, "runtime app URL must match the staging origin");
  expect(runtime.release, expectedRelease, "runtime release must match the deployed release");
  const serializedRuntime = JSON.stringify(runtime).toLowerCase();
  for (const name of PRIVATE_PRODUCTION_ENV_VARS) {
    if (serializedRuntime.includes(name.toLowerCase())) throw new Error(`runtime config exposes private key name ${name}`);
  }
  if (/(secret|password|refresh.?token|private.?key)/i.test(serializedRuntime)) throw new Error("runtime config contains a sensitive field name");
  checks.push("runtime-config-public-only");

  response = await fetchImpl(new URL("/ready", runtime.apiBaseUrl));
  assertStatus(response, 200, "API readiness");
  assertCache(response, "no-store", "API readiness");
  const readiness = await body(response, "API readiness");
  if (readiness.ready !== true || readiness.api?.release !== expectedRelease) throw new Error("API readiness must report healthy dependencies and the expected release");
  checks.push("api-postgres-outbox-readiness");

  response = await get("/workspace");
  assertStatus(response, 200, "web shell");
  assertCache(response, "no-cache", "web shell");
  const hsts = response.headers.get("strict-transport-security") ?? "";
  if (!/max-age=(?:[1-9]\d{4,})/i.test(hsts)) throw new Error("web shell is missing an effective HSTS header");
  checks.push("https-shell-and-hsts");

  response = await get("/auth/session");
  assertStatus(response, 401, "anonymous session");
  assertCache(response, "no-store", "anonymous session");
  checks.push("expired-or-anonymous-session-fails-closed");

  response = await get("/auth/login?returnTo=%2Fworkspace");
  if (response.status < 300 || response.status >= 400) throw new Error("login must redirect to the IdP");
  const authorization = new URL(response.headers.get("location"));
  if (authorization.protocol !== "https:") throw new Error("IdP authorization endpoint must use HTTPS");
  expect(authorization.searchParams.get("redirect_uri"), `${origin.origin}/auth/callback`, "login callback URL mismatch");
  expect(authorization.searchParams.get("code_challenge_method"), "S256", "login must use PKCE S256");
  if (!authorization.searchParams.get("state") || !authorization.searchParams.get("nonce")) throw new Error("login must bind state and nonce");
  const transactionCookie = response.headers.get("set-cookie") ?? "";
  if (!/Secure/i.test(transactionCookie) || !/HttpOnly/i.test(transactionCookie) || !/SameSite=Lax/i.test(transactionCookie)) throw new Error("login transaction cookie is not secure");
  checks.push("login-callback-pkce-cookie");

  response = await get("/auth/callback?error=access_denied");
  assertStatus(response, 400, "invalid callback");
  assertCache(response, "no-store", "invalid callback");
  checks.push("callback-failure-fails-closed");

  response = await get("/service-worker.js");
  assertStatus(response, 200, "service worker");
  assertCache(response, "no-cache", "service worker");
  const sw = await response.text();
  for (const boundary of ["/auth/", "/v1/", "/runtime-config.json", "request.method !== \"GET\""]) {
    if (!sw.includes(boundary)) throw new Error(`deployed service worker is missing cache boundary ${boundary}`);
  }
  checks.push("service-worker-private-data-boundaries");

  response = await get("/manifest.webmanifest");
  assertStatus(response, 200, "manifest");
  assertCache(response, "no-cache", "manifest");
  const manifest = await body(response, "manifest");
  if (!manifest.name || !manifest.start_url || !["standalone", "minimal-ui"].includes(manifest.display)) throw new Error("manifest is not installable");
  checks.push("pwa-manifest-installable");

  response = await get("/offline.html");
  assertStatus(response, 200, "offline fallback");
  const offline = await response.text();
  if (!/not cached|never cached/i.test(offline)) throw new Error("offline fallback must state that tenant data is not cached");
  checks.push("offline-fallback-safe");

  response = await get("/auth-client.js");
  assertStatus(response, 200, "auth client");
  const authClient = await response.text();
  if (/access_token|searchParams\.set\([^)]*token/i.test(authClient)) throw new Error("deployed auth client may place bearer material in a URL");
  response = await get("/auth/events/stream?tenantId=smoke-tenant");
  assertStatus(response, 401, "anonymous SSE session");
  checks.push("sse-url-uses-session-not-bearer");

  response = await get("/auth/session/renew", { method: "POST", headers: { Origin: "https://untrusted.invalid" } });
  assertStatus(response, 403, "cross-origin renewal");
  response = await get("/auth/logout", { method: "POST", headers: { Origin: "https://untrusted.invalid" } });
  assertStatus(response, 403, "cross-origin logout");
  checks.push("renewal-and-logout-origin-bound");

  if (accessToken && tenantId && deniedTenantId) {
    response = await fetchImpl(new URL(`/v1/tenants/${encodeURIComponent(tenantId)}/projects`, runtime.apiBaseUrl), { headers: { Authorization: `Bearer ${accessToken}` } });
    assertStatus(response, 200, "authorized tenant");
    assertCache(response, "no-store", "authorized tenant");
    response = await fetchImpl(new URL(`/v1/tenants/${encodeURIComponent(deniedTenantId)}/projects`, runtime.apiBaseUrl), { headers: { Authorization: `Bearer ${accessToken}` } });
    assertStatus(response, 403, "denied tenant");
    checks.push("cross-tenant-denial");
  } else {
    checks.push("cross-tenant-denial:skipped-without-external-token");
  }

  return Object.freeze({ origin: origin.origin, release: runtime.release, checks });
}
