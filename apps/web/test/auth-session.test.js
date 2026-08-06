import test from "node:test";
import assert from "node:assert/strict";

import { createWebAuthSessionManager } from "../src/auth-session.js";
import { createMemorySessionStore } from "../src/session-store.js";

const config = {
  auth: {
    audience: "https://api.production.xygoaec.com",
    clientId: "xygo-public-client",
    authorizationEndpoint: "https://idp.production.xygoaec.com/authorize",
    tokenEndpoint: "https://idp.production.xygoaec.com/oauth/token",
    endSessionEndpoint: "https://idp.production.xygoaec.com/logout",
    scopes: ["openid", "profile", "email"],
    redirectUri: "https://app.production.xygoaec.com/auth/callback",
    postLogoutRedirectUri: "https://app.production.xygoaec.com/"
  },
  session: {
    secret: "web-session-signing-secret-at-least-32-characters",
    cookieName: "__Host-xygo-session",
    allowedOrigin: "https://app.production.xygoaec.com",
    idleTtlMs: 1_800_000,
    absoluteTtlMs: 28_800_000,
    transactionTtlMs: 300_000,
    tokenRequestTimeoutMs: 10_000,
    tokenClockToleranceSec: 30,
    requireRefreshToken: true
  }
};

function requestCookie(setCookie) {
  const item = Array.isArray(setCookie) ? setCookie.at(-1) : setCookie;
  return item.split(";", 1)[0];
}

test("OIDC login, callback, session, renewal, and logout keep refresh tokens server-side", async () => {
  let current = Date.parse("2026-08-05T00:00:00.000Z");
  const requests = [];
  const manager = createWebAuthSessionManager(config, {
    now: () => current,
    randomBytes: (length) => Buffer.alloc(length, requests.length + 1),
    fetchImpl: async (_url, options) => {
      const body = Object.fromEntries(options.body);
      requests.push(body);
      return {
        ok: true,
        status: 200,
        async json() {
          return body.grant_type === "authorization_code"
            ? { token_type: "Bearer", access_token: "access-a", refresh_token: "refresh-private", expires_in: 300 }
            : { token_type: "Bearer", access_token: "access-b", refresh_token: "refresh-rotated", expires_in: 300 };
        }
      };
    }
  });

  const login = await manager.beginLogin("/control-room");
  const authorization = new URL(login.headers.location);
  assert.equal(login.status, 302);
  assert.equal(authorization.searchParams.get("response_type"), "code");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.match(login.headers["set-cookie"], /Secure; HttpOnly; SameSite=Lax/);

  const callback = new URL(config.auth.redirectUri);
  callback.searchParams.set("code", "authorization-code");
  callback.searchParams.set("state", authorization.searchParams.get("state"));
  const completed = await manager.completeCallback(callback, { cookie: requestCookie(login.headers["set-cookie"]) });
  assert.equal(completed.status, 302);
  assert.equal(completed.headers.location, "/control-room");
  const sessionCookie = requestCookie(completed.headers["set-cookie"]);
  const active = await manager.session({ cookie: sessionCookie });
  assert.deepEqual(active.body, {
    authenticated: true,
    accessToken: "access-a",
    expiresAt: "2026-08-05T00:04:30.000Z"
  });
  assert.equal(JSON.stringify(active).includes("refresh-private"), false);

  current += 60_000;
  assert.equal(manager.checkOrigin({ origin: config.session.allowedOrigin }), true);
  assert.equal(manager.checkOrigin({ origin: "https://attacker.invalid" }), false);
  const renewed = await manager.renew({ cookie: sessionCookie });
  assert.equal(renewed.body.accessToken, "access-b");
  assert.equal(requests[1].refresh_token, "refresh-private");
  const logout = await manager.logout({ cookie: sessionCookie });
  assert.equal(logout.status, 302);
  assert.equal((await manager.session({ cookie: sessionCookie })).status, 401);
});

test("OIDC callback rejects missing, expired, or mismatched transaction state", async () => {
  let current = 0;
  const manager = createWebAuthSessionManager(config, { now: () => current });
  const login = await manager.beginLogin();
  const callback = new URL(`${config.auth.redirectUri}?code=code&state=wrong`);
  assert.equal((await manager.completeCallback(callback, { cookie: requestCookie(login.headers["set-cookie"]) })).status, 400);

  const expiredLogin = await manager.beginLogin();
  const authorization = new URL(expiredLogin.headers.location);
  current = config.session.transactionTtlMs + 1;
  const expired = new URL(config.auth.redirectUri);
  expired.searchParams.set("code", "code");
  expired.searchParams.set("state", authorization.searchParams.get("state"));
  assert.equal((await manager.completeCallback(expired, { cookie: requestCookie(expiredLogin.headers["set-cookie"]) })).status, 400);
});

test("Google token exchange keeps client secret server-side and stores id token for API verification", async () => {
  const googleConfig = {
    ...config,
    auth: {
      ...config.auth,
      provider: "google",
      audience: "google-client-id.apps.googleusercontent.com",
      clientId: "google-client-id.apps.googleusercontent.com",
      clientSecret: "google-client-secret-server-only",
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenEndpoint: "https://oauth2.googleapis.com/token",
      endSessionEndpoint: null
    },
    session: {
      ...config.session,
      requireRefreshToken: false
    }
  };
  const requests = [];
  const manager = createWebAuthSessionManager(googleConfig, {
    randomBytes: (length) => Buffer.alloc(length, requests.length + 1),
    fetchImpl: async (_url, options) => {
      const body = Object.fromEntries(options.body);
      requests.push(body);
      return {
        ok: true,
        status: 200,
        async json() {
          return { token_type: "Bearer", access_token: "google-api-access-token", id_token: "google-id-token-jwt", expires_in: 300 };
        }
      };
    }
  });
  const login = await manager.beginLogin("/workspace");
  const authorization = new URL(login.headers.location);
  const callback = new URL(googleConfig.auth.redirectUri);
  callback.searchParams.set("code", "google-code");
  callback.searchParams.set("state", authorization.searchParams.get("state"));
  const completed = await manager.completeCallback(callback, { cookie: requestCookie(login.headers["set-cookie"]) });
  const sessionCookie = requestCookie(completed.headers["set-cookie"]);
  const active = await manager.session({ cookie: sessionCookie });
  assert.equal(active.body.accessToken, "google-id-token-jwt");
  assert.equal(requests[0].client_secret, "google-client-secret-server-only");
  assert.equal(JSON.stringify(active).includes("google-client-secret"), false);
  const logout = await manager.logout({ cookie: sessionCookie });
  assert.equal(logout.headers.location, googleConfig.auth.postLogoutRedirectUri);
});

test("a persisted session survives manager restart and expired records are cleaned", async () => {
  let current = Date.parse("2026-08-05T00:00:00.000Z");
  const store = createMemorySessionStore({ now: () => current });
  const fetchImpl = async () => ({ ok: true, status: 200, async json() {
    return { token_type: "Bearer", access_token: "restart-access", refresh_token: "restart-refresh", expires_in: 300 };
  } });
  const first = createWebAuthSessionManager(config, { sessionStore: store, fetchImpl, now: () => current });
  const login = await first.beginLogin();
  const authorization = new URL(login.headers.location);
  const callback = new URL(config.auth.redirectUri);
  callback.searchParams.set("code", "restart-code");
  callback.searchParams.set("state", authorization.searchParams.get("state"));
  const completed = await first.completeCallback(callback, { cookie: requestCookie(login.headers["set-cookie"]) });
  const sessionCookie = requestCookie(completed.headers["set-cookie"]);

  const restarted = createWebAuthSessionManager(config, { sessionStore: store, fetchImpl, now: () => current });
  assert.equal((await restarted.session({ cookie: sessionCookie })).body.accessToken, "restart-access");
  current += config.session.absoluteTtlMs + 1;
  assert.equal(await restarted.cleanup(), 1);
  assert.equal((await restarted.session({ cookie: sessionCookie })).status, 401);
});
