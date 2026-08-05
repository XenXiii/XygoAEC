import { setAuthState } from "/release-shell.js";

let runtimePromise;
let session = null;
let renewal = null;
let previouslyAuthenticated = false;

async function runtimeConfig() {
  runtimePromise ??= fetch("/runtime-config.json", { credentials: "same-origin", cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error("Web runtime configuration is unavailable.");
    return response.json();
  });
  return runtimePromise;
}

async function readSession(endpoint) {
  const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Authentication session request failed (${response.status}).`);
  return response.json();
}

async function renew(config) {
  renewal ??= fetch(config.auth.renewEndpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" }
  }).then(async (response) => {
    if (response.status === 401) return null;
    if (!response.ok) throw new Error(`Authentication renewal failed (${response.status}).`);
    return response.json();
  }).finally(() => { renewal = null; });
  return renewal;
}

export async function accessToken({ forceRenew = false } = {}) {
  const config = await runtimeConfig();
  if (config.auth.mode !== "oidc") return null;
  setAuthState("loading");
  session ??= await readSession(config.auth.sessionEndpoint);
  if (!session) {
    setAuthState(previouslyAuthenticated || forceRenew ? "expired" : "signed_out", { loginEndpoint: config.auth.loginEndpoint });
    return null;
  }
  previouslyAuthenticated = true;
  const expiresAt = Date.parse(session.expiresAt);
  if (forceRenew || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + config.auth.renewBeforeSec * 1000) {
    session = await renew(config);
  }
  if (!session) {
    setAuthState("expired", { loginEndpoint: config.auth.loginEndpoint });
    return null;
  }
  setAuthState("ready");
  return session?.accessToken ?? null;
}

export async function authenticatedFetch(url, options = {}) {
  const config = await runtimeConfig();
  if (config.auth.mode !== "oidc") return fetch(url, options);
  let token = await accessToken();
  if (!token) {
    throw new Error("Authentication is required.");
  }
  const request = (bearer) => fetch(url, {
    ...options,
    headers: { ...(options.headers ?? {}), authorization: `Bearer ${bearer}` }
  });
  let response = await request(token);
  if (response.status === 401) {
    token = await accessToken({ forceRenew: true });
    if (token) response = await request(token);
  }
  if (response.status === 401) setAuthState("expired", { loginEndpoint: config.auth.loginEndpoint });
  if (response.status === 403) setAuthState("unauthorized");
  return response;
}

export async function logout() {
  const config = await runtimeConfig();
  if (config.auth.mode !== "oidc") {
    window.location.assign("/");
    return;
  }
  const response = await fetch(config.auth.logoutEndpoint, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    redirect: "manual"
  });
  session = null;
  previouslyAuthenticated = false;
  if (!response.ok && response.type !== "opaqueredirect") {
    setAuthState("error", { detail: "Sign out could not be completed safely." });
    return;
  }
  window.location.assign("/");
}

export async function authenticatedEventSourceUrl(url) {
  const config = await runtimeConfig();
  if (config.auth.mode !== "oidc") return url;
  const target = new URL(url);
  const match = target.pathname.match(/^\/v1\/tenants\/([^/]+)\/events\/stream$/);
  if (!match) throw new Error("Authenticated event streams require a tenant event-stream URL.");
  return `/auth/events/stream?tenantId=${encodeURIComponent(decodeURIComponent(match[1]))}`;
}
