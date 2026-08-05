import crypto from "node:crypto";
import { createConfiguredSessionStore } from "./session-store.js";

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function cookieValue(headers, name) {
  const cookies = String(headers?.cookie ?? "").split(";");
  for (const cookie of cookies) {
    const [key, ...parts] = cookie.trim().split("=");
    if (key === name) return parts.join("=");
  }
  return null;
}

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function signedValue(value, secret) {
  return `${value}.${sign(value, secret)}`;
}

function verifySigned(value, secret) {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const id = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = sign(id, secret);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  return id;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

function tokenExpiry(payload, now, clockToleranceSec = 0) {
  const expiresIn = Number(payload?.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn < 60 || expiresIn > 86_400) {
    throw new Error("OIDC token response expires_in must be between 60 and 86400 seconds.");
  }
  if (String(payload?.token_type ?? "").toLowerCase() !== "bearer" || !payload?.access_token) {
    throw new Error("OIDC token response must contain a Bearer access token.");
  }
  return now + Math.max(1, expiresIn - clockToleranceSec) * 1000;
}

export function createWebAuthSessionManager(config, {
  fetchImpl = fetch,
  now = () => Date.now(),
  randomBytes = crypto.randomBytes,
  sessionStore
} = {}) {
  const store = createConfiguredSessionStore(config, { sessionStore, now });
  const authCookie = "__Host-xygo-auth";
  const sessionCookie = config.session.cookieName;

  async function readSession(headers) {
    const id = verifySigned(cookieValue(headers, sessionCookie), config.session.secret);
    const session = id ? await store.get(id) : null;
    return session?.kind === "user_session" ? { id, ...session } : null;
  }

  async function exchange(parameters) {
    const response = await fetchImpl(config.auth.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams(parameters),
      signal: AbortSignal.timeout(config.session.tokenRequestTimeoutMs)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`OIDC token exchange failed with HTTP ${response.status}.`);
    return payload;
  }

  return {
    async beginLogin(returnTo = "/control-room") {
      await store.cleanup();
      if (!/^\/[A-Za-z0-9/_-]*$/.test(returnTo) || returnTo.startsWith("//")) returnTo = "/control-room";
      const id = base64url(randomBytes(24));
      const state = base64url(randomBytes(32));
      const nonce = base64url(randomBytes(32));
      const verifier = base64url(randomBytes(48));
      const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
      const expiresAt = now() + config.session.transactionTtlMs;
      await store.set(id, { kind: "login_transaction", state, nonce, verifier, returnTo, idleExpiresAt: expiresAt, absoluteExpiresAt: expiresAt });
      const target = new URL(config.auth.authorizationEndpoint);
      target.searchParams.set("client_id", config.auth.clientId);
      target.searchParams.set("redirect_uri", config.auth.redirectUri);
      target.searchParams.set("response_type", "code");
      target.searchParams.set("scope", config.auth.scopes.join(" "));
      target.searchParams.set("audience", config.auth.audience);
      target.searchParams.set("state", state);
      target.searchParams.set("nonce", nonce);
      target.searchParams.set("code_challenge", challenge);
      target.searchParams.set("code_challenge_method", "S256");
      return {
        status: 302,
        headers: { location: target.toString(), "set-cookie": cookie(authCookie, signedValue(id, config.session.secret), Math.floor(config.session.transactionTtlMs / 1000)), "cache-control": "no-store" }
      };
    },
    async completeCallback(url, headers = {}) {
      const transactionId = verifySigned(cookieValue(headers, authCookie), config.session.secret);
      const candidate = transactionId ? await store.get(transactionId) : null;
      const transaction = candidate?.kind === "login_transaction" ? candidate : null;
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      if (!transaction || !state || state !== transaction.state || !code || url.searchParams.get("error")) {
        return { status: 400, body: { code: "invalid_oidc_callback" }, headers: { "set-cookie": clearCookie(authCookie), "cache-control": "no-store" } };
      }
      await store.delete(transactionId);
      const payload = await exchange({
        grant_type: "authorization_code",
        client_id: config.auth.clientId,
        code,
        redirect_uri: config.auth.redirectUri,
        code_verifier: transaction.verifier
      });
      if (config.session.requireRefreshToken && !payload.refresh_token) throw new Error("OIDC token response must contain a refresh token.");
      const current = now();
      const id = base64url(randomBytes(32));
      await store.set(id, {
        kind: "user_session",
        accessToken: required(payload.access_token, "OIDC access token"),
        refreshToken: payload.refresh_token ?? null,
        accessTokenExpiresAt: tokenExpiry(payload, current, config.session.tokenClockToleranceSec),
        createdAt: current,
        idleExpiresAt: current + config.session.idleTtlMs,
        absoluteExpiresAt: current + config.session.absoluteTtlMs
      });
      return {
        status: 302,
        headers: {
          location: transaction.returnTo,
          "set-cookie": [clearCookie(authCookie), cookie(sessionCookie, signedValue(id, config.session.secret), Math.floor(config.session.absoluteTtlMs / 1000))],
          "cache-control": "no-store"
        }
      };
    },
    async session(headers = {}) {
      const session = await readSession(headers);
      if (!session) return { status: 401, body: { authenticated: false } };
      const current = now();
      session.idleExpiresAt = Math.min(current + config.session.idleTtlMs, session.absoluteExpiresAt);
      await store.set(session.id, session);
      return { status: 200, body: { authenticated: true, accessToken: session.accessToken, expiresAt: new Date(session.accessTokenExpiresAt).toISOString() } };
    },
    async renew(headers = {}) {
      const session = await readSession(headers);
      if (!session?.refreshToken) return { status: 401, body: { authenticated: false, code: "session_not_renewable" } };
      const payload = await exchange({
        grant_type: "refresh_token",
        client_id: config.auth.clientId,
        refresh_token: session.refreshToken
      });
      const current = now();
      session.accessToken = required(payload.access_token, "OIDC access token");
      session.refreshToken = payload.refresh_token ?? session.refreshToken;
      session.accessTokenExpiresAt = tokenExpiry(payload, current, config.session.tokenClockToleranceSec);
      session.idleExpiresAt = Math.min(current + config.session.idleTtlMs, session.absoluteExpiresAt);
      await store.set(session.id, session);
      return { status: 200, body: { authenticated: true, accessToken: session.accessToken, expiresAt: new Date(session.accessTokenExpiresAt).toISOString() } };
    },
    async logout(headers = {}) {
      const id = verifySigned(cookieValue(headers, sessionCookie), config.session.secret);
      if (id) await store.delete(id);
      const target = new URL(config.auth.endSessionEndpoint);
      target.searchParams.set("client_id", config.auth.clientId);
      target.searchParams.set("post_logout_redirect_uri", config.auth.postLogoutRedirectUri);
      return { status: 302, headers: { location: target.toString(), "set-cookie": clearCookie(sessionCookie), "cache-control": "no-store" } };
    },
    checkOrigin(headers = {}) {
      return headers.origin === config.session.allowedOrigin;
    },
    async accessToken(headers = {}) {
      const session = await readSession(headers);
      return session?.accessToken ?? null;
    },
    cleanup() {
      return store.cleanup();
    }
  };
}
