import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { POSTGRES_MIGRATIONS } from "../../../apps/api/src/repositories/postgres-migrations.js";
import { validProductionEnvironment } from "../../production-config/test/fixtures.js";
import { assertStagingDeploymentReadiness, runStagingSmoke } from "../src/index.js";

const vercelConfig = JSON.parse(fs.readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"));
const serviceWorkerSource = fs.readFileSync(new URL("../../../apps/web/public/service-worker.js", import.meta.url), "utf8");
const migrationVersions = POSTGRES_MIGRATIONS.map(({ version }) => version);

function stagingEnvironment(overrides = {}) {
  const env = validProductionEnvironment({
    XYGO_DEPLOY_ENVIRONMENT: "staging",
    XYGO_RELEASE: "abcdef0123456789",
    XYGO_WEB_APP_URL: "https://app.staging.xygoaec.com",
    XYGO_WEB_API_BASE_URL: "https://api.staging.xygoaec.com",
    XYGO_WEB_ALLOWED_ORIGIN: "https://app.staging.xygoaec.com",
    XYGO_OIDC_ISSUER: "https://idp.staging.xygoaec.com/",
    XYGO_OIDC_AUDIENCE: "https://api.staging.xygoaec.com",
    XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT: "https://idp.staging.xygoaec.com/authorize",
    XYGO_WEB_OIDC_TOKEN_ENDPOINT: "https://idp.staging.xygoaec.com/oauth/token",
    XYGO_WEB_OIDC_END_SESSION_ENDPOINT: "https://idp.staging.xygoaec.com/logout",
    XYGO_WEB_MONITORING_ENDPOINT: "https://browser-monitoring.staging.xygoaec.com/events",
    XYGO_WEB_SESSION_PG_URL: "postgresql://xygo:external-secret@db.staging.xygoaec.com/xygo?sslmode=verify-full",
    XYGO_STAGING_WEB_HOST: "app.staging.xygoaec.com",
    XYGO_STAGING_API_HOST: "api.staging.xygoaec.com",
    XYGO_STAGING_IDP_CALLBACK_URL: "https://app.staging.xygoaec.com/auth/callback",
    XYGO_STAGING_IDP_LOGOUT_URL: "https://app.staging.xygoaec.com/",
    XYGO_STAGING_INGRESS_FORWARDED_PROTO: "https",
    XYGO_STAGING_TLS_MIN_VERSION: "1.2",
    XYGO_STAGING_HSTS_MAX_AGE: "31536000",
    XYGO_STAGING_CACHE_AUTHENTICATED: "false",
    XYGO_STAGING_REDACT_AUTHORIZATION: "true",
    XYGO_STAGING_REDACT_COOKIE: "true",
    XYGO_STAGING_REDACT_QUERY_STRINGS: "true"
  });
  return { ...env, ...overrides };
}

function preflight(env = stagingEnvironment(), options = {}) {
  return assertStagingDeploymentReadiness({ env, vercelConfig, serviceWorkerSource, migrationVersions, ...options });
}

test("staging preflight accepts a secure externally configured deployment", () => {
  assert.deepEqual(preflight(), {
    deployEnvironment: "staging",
    release: "abcdef0123456789",
    webOrigin: "https://app.staging.xygoaec.com",
    apiOrigin: "https://api.staging.xygoaec.com",
    sessionStore: "postgres",
    cacheAuthenticated: false
  });
});

for (const [name, value, pattern] of [
  ["XYGO_WEB_APP_URL", "http://app.staging.xygoaec.com", /HTTPS/i],
  ["XYGO_WEB_SESSION_STORE", "memory", /must be postgres/i],
  ["XYGO_API_PG_URL", "postgresql://xygo:secret@db.staging.xygoaec.com/xygo?sslmode=disable", /sslmode/i],
  ["XYGO_WEB_SESSION_COOKIE_SECURE", "false", /must be true/i],
  ["XYGO_WEB_SESSION_SECRET", "placeholder", /placeholder|at least/i],
  ["XYGO_STAGING_WEB_HOST", "other.staging.xygoaec.com", /must match/i],
  ["XYGO_STAGING_IDP_CALLBACK_URL", "https://app.staging.xygoaec.com/wrong", /callback must exactly match/i],
  ["XYGO_STAGING_INGRESS_FORWARDED_PROTO", "http", /original HTTPS/i],
  ["XYGO_STAGING_TLS_MIN_VERSION", "1.1", /TLS minimum/i],
  ["XYGO_STAGING_HSTS_MAX_AGE", "60", /HSTS max-age/i],
  ["XYGO_STAGING_CACHE_AUTHENTICATED", "true", /caching of authenticated/i],
  ["XYGO_STAGING_REDACT_QUERY_STRINGS", "false", /must be true/i]
]) {
  test(`staging preflight fails closed for ${name}`, () => {
    assert.throws(() => preflight(stagingEnvironment({ [name]: value })), pattern);
  });
}

test("staging preflight detects unsafe release cache rules and missing migrations", () => {
  const unsafe = structuredClone(vercelConfig);
  unsafe.headers.find(({ source }) => source === "/runtime-config.json").headers[0].value = "public, max-age=3600";
  assert.throws(() => preflight(stagingEnvironment(), { vercelConfig: unsafe }), /runtime config must be private/i);
  const staticOnly = structuredClone(vercelConfig);
  delete staticOnly.rewrites;
  assert.throws(() => preflight(stagingEnvironment(), { vercelConfig: staticOnly }), /dynamic web runtime/i);
  assert.throws(() => preflight(stagingEnvironment(), { migrationVersions: migrationVersions.filter((value) => value !== "0008_web_auth_sessions") }), /migration is missing/i);
  assert.throws(() => preflight(stagingEnvironment(), { serviceWorkerSource: serviceWorkerSource.replace('"/auth/", ', "") }), /cache boundary/i);
});

function json(value, init = {}) {
  return new Response(JSON.stringify(value), { ...init, headers: { "content-type": "application/json", ...init.headers } });
}

function smokeFetch({ authorized = false } = {}) {
  return async (input, init = {}) => {
    const url = new URL(input);
    if (url.hostname === "api.staging.xygoaec.com") {
      if (url.pathname === "/ready") return json({ ready: true, api: { ready: true, release: "release-123" }, database: { ready: true }, outbox: { ready: true } }, { status: 200, headers: { "cache-control": "no-store" } });
      const denied = url.pathname.includes("tenant-denied");
      return json(denied ? { code: "tenant_denied" } : [], { status: denied ? 403 : 200, headers: { "cache-control": "private, no-store" } });
    }
    if (url.pathname === "/runtime-config.json") return json({ environment: "staging", release: "release-123", appUrl: url.origin, apiBaseUrl: "https://api.staging.xygoaec.com", auth: { mode: "oidc" } }, { status: 200, headers: { "cache-control": "private, no-store" } });
    if (url.pathname === "/workspace") return new Response("shell", { status: 200, headers: { "cache-control": "no-cache", "strict-transport-security": "max-age=31536000; includeSubDomains" } });
    if (url.pathname === "/auth/session") return json({ code: "authentication_required" }, { status: 401, headers: { "cache-control": "no-store" } });
    if (url.pathname === "/auth/login") {
      const location = new URL("https://idp.staging.xygoaec.com/authorize");
      location.searchParams.set("redirect_uri", `${url.origin}/auth/callback`);
      location.searchParams.set("code_challenge_method", "S256");
      location.searchParams.set("state", "opaque-state");
      location.searchParams.set("nonce", "opaque-nonce");
      return new Response(null, { status: 302, headers: { location, "set-cookie": "__Host-xygo-auth=opaque; Secure; HttpOnly; SameSite=Lax; Path=/" } });
    }
    if (url.pathname === "/auth/callback") return json({ code: "invalid_callback" }, { status: 400, headers: { "cache-control": "no-store" } });
    if (url.pathname === "/service-worker.js") return new Response(serviceWorkerSource, { status: 200, headers: { "cache-control": "no-cache" } });
    if (url.pathname === "/manifest.webmanifest") return json({ name: "Xygo Workspace", start_url: "/workspace", display: "standalone" }, { status: 200, headers: { "cache-control": "no-cache" } });
    if (url.pathname === "/offline.html") return new Response("Private tenant data is never cached.", { status: 200 });
    if (url.pathname === "/auth-client.js") return new Response("export function openEvents(tenantId) { return new EventSource(`/auth/events/stream?tenantId=${encodeURIComponent(tenantId)}`); }");
    if (url.pathname === "/auth/events/stream") return json({ code: "authentication_required" }, { status: authorized ? 400 : 401 });
    if (url.pathname === "/auth/session/renew" || url.pathname === "/auth/logout") return json({ code: "invalid_origin" }, { status: 403 });
    throw new Error(`unexpected smoke request: ${init.method ?? "GET"} ${url}`);
  };
}

test("staging smoke validates HTTPS, auth failure paths, PWA boundaries, and optional tenant isolation", async () => {
  const result = await runStagingSmoke({
    baseUrl: "https://app.staging.xygoaec.com",
    expectedRelease: "release-123",
    tenantId: "tenant-allowed",
    deniedTenantId: "tenant-denied",
    accessToken: "externally-supplied-token",
    fetchImpl: smokeFetch()
  });
  assert.ok(result.checks.includes("cross-tenant-denial"));
  assert.ok(result.checks.includes("sse-url-uses-session-not-bearer"));
});

test("staging smoke never requires a real token for public checks", async () => {
  const result = await runStagingSmoke({ baseUrl: "https://app.staging.xygoaec.com", expectedRelease: "release-123", fetchImpl: smokeFetch() });
  assert.ok(result.checks.includes("cross-tenant-denial:skipped-without-external-token"));
});

test("staging smoke rejects insecure origins and private runtime fields", async () => {
  await assert.rejects(() => runStagingSmoke({ baseUrl: "http://app.staging.xygoaec.com", expectedRelease: "release-123", fetchImpl: smokeFetch() }), /HTTPS origin/i);
  const fetchImpl = async (input, init) => {
    const url = new URL(input);
    if (url.pathname === "/runtime-config.json") return json({ appUrl: url.origin, release: "release-123", client_secret: "leak" }, { status: 200, headers: { "cache-control": "no-store" } });
    return smokeFetch()(input, init);
  };
  await assert.rejects(() => runStagingSmoke({ baseUrl: "https://app.staging.xygoaec.com", expectedRelease: "release-123", fetchImpl }), /sensitive field/i);
});
