let runtimePromise;
let session = null;
let renewal = null;

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
  session ??= await readSession(config.auth.sessionEndpoint);
  if (!session) return null;
  const expiresAt = Date.parse(session.expiresAt);
  if (forceRenew || !Number.isFinite(expiresAt) || expiresAt <= Date.now() + config.auth.renewBeforeSec * 1000) {
    session = await renew(config);
  }
  return session?.accessToken ?? null;
}

export async function authenticatedFetch(url, options = {}) {
  const config = await runtimeConfig();
  if (config.auth.mode !== "oidc") return fetch(url, options);
  let token = await accessToken();
  if (!token) {
    window.location.assign(`${config.auth.loginEndpoint}?returnTo=${encodeURIComponent(window.location.pathname)}`);
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
  return response;
}

export async function authenticatedEventSourceUrl(url) {
  const token = await accessToken();
  if (!token) return url;
  const target = new URL(url);
  target.searchParams.set("access_token", token);
  return target.toString();
}
