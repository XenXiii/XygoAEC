import test from "node:test";
import assert from "node:assert/strict";

import { createWebServer } from "../src/server.js";
import { assertWebRuntimeConfig, loadWebRuntimeConfig, publicWebRuntimeConfig } from "../src/runtime-config.js";

const productionEnv = {
  NODE_ENV: "production",
  STAGED_MODE: "false",
  XYGO_AUTH_MODE: "oidc",
  XYGO_OIDC_PROVIDER: "auth0",
  XYGO_OIDC_ISSUER: "https://tenant.example-idp.com/",
  XYGO_OIDC_AUDIENCE: "https://api.xygo.example",
  XYGO_WEB_APP_URL: "https://app.xygo.example",
  XYGO_WEB_API_BASE_URL: "https://api.xygo.example",
  XYGO_WEB_OIDC_CLIENT_ID: "public-client-id",
  XYGO_WEB_OIDC_AUTHORIZATION_ENDPOINT: "https://tenant.example-idp.com/authorize",
  XYGO_WEB_OIDC_TOKEN_ENDPOINT: "https://tenant.example-idp.com/oauth/token",
  XYGO_WEB_OIDC_END_SESSION_ENDPOINT: "https://tenant.example-idp.com/logout"
};

test("production web startup fails closed without managed OIDC configuration", () => {
  assert.throws(
    () => createWebServer({ env: { NODE_ENV: "production" } }),
    /requires XYGO_AUTH_MODE=oidc/
  );
  assert.throws(
    () => createWebServer({ env: { ...productionEnv, XYGO_WEB_OIDC_TOKEN_ENDPOINT: undefined } }),
    /XYGO_WEB_OIDC_TOKEN_ENDPOINT/
  );
  assert.throws(
    () => createWebServer({ env: { ...productionEnv, XYGO_WEB_API_BASE_URL: "http:\/\/api.xygo.example" } }),
    /XYGO_WEB_API_BASE_URL must be an HTTPS URL/
  );
  assert.throws(
    () => createWebServer({ env: { ...productionEnv, XYGO_WEB_APP_URL: "https://app.xygo.example?bad=callback" } }),
    /XYGO_WEB_APP_URL must be an HTTPS URL/
  );
  assert.throws(
    () => createWebServer({ env: { ...productionEnv, XYGO_WEB_OIDC_CLIENT_SECRET: "must-not-reach-browser" } }),
    /CLIENT_SECRET is forbidden/
  );
});

test("public runtime config fixes browser auth to code plus PKCE and memory tokens", () => {
  const config = assertWebRuntimeConfig(loadWebRuntimeConfig(productionEnv), productionEnv);
  config.auth.internalSecret = "must-not-reach-browser";
  const publicConfig = publicWebRuntimeConfig(config);
  assert.equal(publicConfig.auth.responseType, "code");
  assert.equal(publicConfig.auth.pkceMethod, "S256");
  assert.equal(publicConfig.auth.accessTokenStorage, "memory");
  assert.equal(publicConfig.auth.redirectUri, "https://app.xygo.example/auth/callback");
  assert.ok(publicConfig.auth.scopes.includes("openid"));
  assert.equal("clientSecret" in publicConfig.auth, false);
  assert.equal("internalSecret" in publicConfig.auth, false);
});

test("web server exposes only the non-secret managed IdP runtime manifest", () => {
  const secretValues = {
    XYGO_API_PG_URL: "postgres://user:database-secret@db.example/xygo",
    XYGO_AUDIT_SIGNING_KEY: "audit-signing-secret"
  };
  const server = createWebServer({ env: { ...productionEnv, ...secretValues } });
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
  assert.equal(body.apiBaseUrl, "https://api.xygo.example");
  assert.equal(JSON.stringify(body).includes("database-secret"), false);
  assert.equal(JSON.stringify(body).includes("audit-signing-secret"), false);
});
