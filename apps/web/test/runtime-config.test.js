import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createWebServer } from "../src/server.js";
import { assertWebRuntimeConfig, loadWebRuntimeConfig, publicWebRuntimeConfig } from "../src/runtime-config.js";
import {
  PRIVATE_PRODUCTION_ENV_VARS,
  SERVER_ONLY_WEB_AUTH_ENV_VARS,
  SERVER_ONLY_STORAGE_ENV_VARS
} from "../../../packages/production-config/src/index.js";

const productionEnv = {
  NODE_ENV: "production",
  STAGED_MODE: "false",
  XYGO_DEPLOY_ENVIRONMENT: "production",
  XYGO_RELEASE: "0123456789abcdef",
  XYGO_AUTH_MODE: "oidc",
  XYGO_OIDC_PROVIDER: "auth0",
  XYGO_OIDC_ISSUER: "https://idp.production.xygoaec.com/",
  XYGO_OIDC_AUDIENCE: "https://api.production.xygoaec.com",
  XYGO_WEB_APP_URL: "https://app.production.xygoaec.com",
  XYGO_WEB_API_BASE_URL: "https://api.production.xygoaec.com",
  XYGO_WEB_OIDC_CLIENT_ID: "xygo-production-public-client",
  XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT: "https://idp.production.xygoaec.com/authorize",
  XYGO_WEB_OIDC_TOKEN_ENDPOINT: "https://idp.production.xygoaec.com/oauth/token",
  XYGO_WEB_OIDC_END_SESSION_ENDPOINT: "https://idp.production.xygoaec.com/logout",
  XYGO_WEB_OIDC_SCOPES: "openid profile email",
  XYGO_WEB_SESSION_SECRET: "web-session-signing-secret-at-least-32-characters",
  XYGO_WEB_SESSION_ENCRYPTION_KEY: "web-session-encryption-secret-at-least-32-characters",
  XYGO_WEB_SESSION_STORE: "postgres",
  XYGO_WEB_SESSION_PG_URL: "postgresql://xygo:password@db.production.xygoaec.com/xygo?sslmode=verify-full",
  XYGO_WEB_SESSION_COOKIE_NAME: "__Host-xygo-session",
  XYGO_WEB_SESSION_COOKIE_SECURE: "true",
  XYGO_WEB_SESSION_COOKIE_HTTP_ONLY: "true",
  XYGO_WEB_SESSION_COOKIE_SAME_SITE: "lax",
  XYGO_WEB_SESSION_IDLE_SEC: "1800",
  XYGO_WEB_SESSION_ABSOLUTE_SEC: "28800",
  XYGO_WEB_AUTH_TRANSACTION_TTL_SEC: "300",
  XYGO_WEB_TOKEN_REQUEST_TIMEOUT_MS: "10000",
  XYGO_WEB_TOKEN_CLOCK_TOLERANCE_SEC: "30",
  XYGO_WEB_TOKEN_RENEW_BEFORE_SEC: "120",
  XYGO_WEB_REQUIRE_REFRESH_TOKEN: "true",
  XYGO_WEB_ALLOWED_ORIGIN: "https://app.production.xygoaec.com",
  XYGO_WEB_MONITORING_ENDPOINT: "https://browser-monitoring.production.xygoaec.com/events"
};

test("production web startup fails closed without managed OIDC configuration", () => {
  assert.throws(
    () => createWebServer({ env: { NODE_ENV: "production" } }),
    /Production web configuration error/
  );
  assert.throws(
    () => createWebServer({ env: { ...productionEnv, XYGO_WEB_OIDC_TOKEN_ENDPOINT: undefined } }),
    /XYGO_WEB_OIDC_TOKEN_ENDPOINT/
  );
  assert.throws(
    () => createWebServer({ env: { ...productionEnv, XYGO_WEB_API_BASE_URL: "http:\/\/api.production.xygoaec.com" } }),
    /XYGO_WEB_API_BASE_URL must be an HTTPS URL/
  );
  assert.throws(
    () => createWebServer({ env: { ...productionEnv, XYGO_WEB_APP_URL: "https://app.production.xygoaec.com?bad=callback" } }),
    /XYGO_WEB_APP_URL must be an HTTPS URL/
  );
  assert.throws(
    () => createWebServer({ env: { ...productionEnv, XYGO_WEB_OIDC_CLIENT_SECRET: "must-not-reach-browser" } }),
    /only supported for providers/
  );
});

test("public runtime config fixes browser auth to code plus PKCE and memory tokens", () => {
  const config = assertWebRuntimeConfig(loadWebRuntimeConfig(productionEnv), productionEnv);
  config.auth.internalSecret = "must-not-reach-browser";
  const publicConfig = publicWebRuntimeConfig(config);
  assert.equal(publicConfig.auth.responseType, "code");
  assert.equal(publicConfig.auth.pkceMethod, "S256");
  assert.equal(publicConfig.auth.accessTokenStorage, "memory");
  assert.equal(publicConfig.auth.sessionEndpoint, "/auth/session");
  assert.equal(publicConfig.auth.renewEndpoint, "/auth/session/renew");
  assert.equal(publicConfig.auth.redirectUri, "https://app.production.xygoaec.com/auth/callback");
  assert.equal(publicConfig.environment, "production");
  assert.equal(publicConfig.release, "0123456789abcdef");
  assert.equal(publicConfig.monitoring.endpoint, "https://browser-monitoring.production.xygoaec.com/events");
  assert.ok(publicConfig.auth.scopes.includes("openid"));
  assert.equal("clientSecret" in publicConfig.auth, false);
  assert.equal("internalSecret" in publicConfig.auth, false);
  assert.equal(JSON.stringify(publicConfig).includes(productionEnv.XYGO_WEB_SESSION_ENCRYPTION_KEY), false);
  assert.equal(JSON.stringify(publicConfig).includes(productionEnv.XYGO_WEB_SESSION_PG_URL), false);
});

test("Google OIDC uses a server-only client secret and optional provider logout", () => {
  const googleEnv = {
    ...productionEnv,
    XYGO_OIDC_PROVIDER: "google",
    XYGO_OIDC_ISSUER: "https://accounts.google.com",
    XYGO_OIDC_AUDIENCE: "google-client-id.apps.googleusercontent.com",
    XYGO_WEB_OIDC_CLIENT_ID: "google-client-id.apps.googleusercontent.com",
    XYGO_WEB_OIDC_CLIENT_SECRET: "google-client-secret-server-only",
    XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT: "https://accounts.google.com/o/oauth2/v2/auth",
    XYGO_WEB_OIDC_TOKEN_ENDPOINT: "https://oauth2.googleapis.com/token",
    XYGO_WEB_OIDC_END_SESSION_ENDPOINT: undefined
  };
  const config = assertWebRuntimeConfig(loadWebRuntimeConfig(googleEnv), googleEnv);
  const publicConfig = publicWebRuntimeConfig(config);
  assert.equal(publicConfig.auth.provider, "google");
  assert.equal(publicConfig.auth.redirectUri, "https://app.production.xygoaec.com/auth/callback");
  assert.equal(publicConfig.auth.endSessionEndpoint, null);
  assert.equal(JSON.stringify(publicConfig).includes(googleEnv.XYGO_WEB_OIDC_CLIENT_SECRET), false);
});

test("web server exposes only the non-secret managed IdP runtime manifest", () => {
  const secretValues = Object.fromEntries(
    PRIVATE_PRODUCTION_ENV_VARS
      .filter((name) => name !== "XYGO_WEB_OIDC_CLIENT_SECRET")
      .map((name, index) => [name, `private-sentinel-${index}-must-not-be-public`])
  );
  const storageValues = Object.fromEntries(
    SERVER_ONLY_STORAGE_ENV_VARS.map((name, index) => [name, `storage-sentinel-${index}-must-not-be-public`])
  );
  const authValues = Object.fromEntries(
    SERVER_ONLY_WEB_AUTH_ENV_VARS.map((name, index) => [name, `auth-sentinel-${index}-must-not-be-public`])
  );
  Object.assign(authValues, {
    XYGO_WEB_SESSION_SECRET: "auth-session-secret-sentinel-at-least-32-characters",
    XYGO_WEB_SESSION_ENCRYPTION_KEY: "auth-session-encryption-sentinel-at-least-32-characters",
    XYGO_WEB_SESSION_STORE: "postgres",
    XYGO_WEB_SESSION_PG_URL: "postgresql://xygo:password@db.production.xygoaec.com/xygo?sslmode=verify-full",
    XYGO_WEB_SESSION_COOKIE_NAME: "__Host-xygo-session",
    XYGO_WEB_SESSION_COOKIE_SECURE: "true",
    XYGO_WEB_SESSION_COOKIE_HTTP_ONLY: "true",
    XYGO_WEB_SESSION_COOKIE_SAME_SITE: "lax",
    XYGO_WEB_SESSION_IDLE_SEC: "1800",
    XYGO_WEB_SESSION_ABSOLUTE_SEC: "28800",
    XYGO_WEB_AUTH_TRANSACTION_TTL_SEC: "300",
    XYGO_WEB_TOKEN_REQUEST_TIMEOUT_MS: "10000",
    XYGO_WEB_TOKEN_CLOCK_TOLERANCE_SEC: "30",
    XYGO_WEB_TOKEN_RENEW_BEFORE_SEC: "120",
    XYGO_WEB_REQUIRE_REFRESH_TOKEN: "true",
    XYGO_WEB_ALLOWED_ORIGIN: productionEnv.XYGO_WEB_APP_URL
  });
  const server = createWebServer({ env: { ...productionEnv, ...secretValues, ...storageValues, ...authValues } });
  let status;
  let headers;
  let responseBody;
  server.emit("request", { method: "GET", url: "/runtime-config.json" }, {
    writeHead(nextStatus, nextHeaders) {
      status = nextStatus;
      headers = nextHeaders;
    },
    end(value) {
      responseBody = value;
    }
  });
  assert.equal(status, 200);
  assert.equal(headers["cache-control"], "no-store");
  const body = JSON.parse(responseBody);
  assert.equal(body.auth.provider, "auth0");
  assert.equal(body.apiBaseUrl, "https://api.production.xygoaec.com");
  const serialized = JSON.stringify(body);
  for (const secret of Object.values(secretValues)) {
    assert.equal(serialized.includes(secret), false);
  }
  for (const value of Object.values(storageValues)) {
    assert.equal(serialized.includes(value), false);
  }
  assert.equal(serialized.includes(authValues.XYGO_WEB_SESSION_SECRET), false);
  for (const name of SERVER_ONLY_WEB_AUTH_ENV_VARS) assert.equal(name in body, false);
});

test("authenticated application surfaces use the shared bearer-session client", () => {
  for (const name of ["app.js", "blueprint.js", "client-portal.js", "field-reports.js", "platform-blueprint.js"]) {
    const source = fs.readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8");
    assert.match(source, /from "\/auth-client\.js"/);
    assert.match(source, /authenticatedFetch/);
  }
  const authClient = fs.readFileSync(new URL("../public/auth-client.js", import.meta.url), "utf8");
  assert.match(authClient, /authorization: `Bearer \$\{bearer\}`/);
  assert.match(authClient, /response\.status === 401/);
  assert.doesNotMatch(authClient, /localStorage|sessionStorage/);
  assert.doesNotMatch(authClient, /searchParams\.set\(["']access_token/);
  assert.match(authClient, /\/auth\/events\/stream\?tenantId=/);
  const server = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(server, /authorization: `Bearer \$\{token\}`/);
});
