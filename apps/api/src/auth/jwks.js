import { AuthError } from "./jwt.js";

// JWKS providers. The remote provider fetches the issuer's key set and caches it;
// the static provider is used in tests and for offline verification. Both expose
// an async getKeys() returning an array of JWK objects.

export function createStaticJwks(keys = []) {
  return {
    async getKeys() {
      return keys;
    }
  };
}

export function createRemoteJwks({ jwksUri, fetchImpl = fetch, cacheTtlMs = 10 * 60 * 1000 } = {}) {
  if (!jwksUri) {
    throw new AuthError("config_error", "createRemoteJwks requires a jwksUri.");
  }

  let cache = { keys: null, fetchedAt: 0 };

  async function refresh(now) {
    let response;
    try {
      response = await fetchImpl(jwksUri);
    } catch (error) {
      throw new AuthError("jwks_unavailable", `Could not reach JWKS endpoint: ${error.message}`);
    }

    if (!response.ok) {
      throw new AuthError("jwks_unavailable", `JWKS endpoint returned ${response.status}.`);
    }

    const body = await response.json();
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    if (keys.length === 0) {
      throw new AuthError("jwks_empty", "JWKS endpoint returned no keys.");
    }

    cache = { keys, fetchedAt: now };
    return keys;
  }

  return {
    async getKeys({ now = Date.now(), forceRefresh = false } = {}) {
      if (!forceRefresh && cache.keys && now - cache.fetchedAt < cacheTtlMs) {
        return cache.keys;
      }
      return refresh(now);
    }
  };
}
