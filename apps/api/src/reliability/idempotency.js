// Idempotency store for write requests. A client that retries a POST with the same
// Idempotency-Key (within TTL) gets the original response replayed instead of a
// duplicate write. In-memory per-process (like the rate limiter); a multi-instance
// deployment needs a shared store — tracked as a follow-up.
export function createIdempotencyStore({ ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  const entries = new Map(); // key -> { response, expiresAt }

  function get(key, now = Date.now()) {
    const entry = entries.get(key);
    if (!entry) {
      return null;
    }
    if (now >= entry.expiresAt) {
      entries.delete(key);
      return null;
    }
    return entry.response;
  }

  function set(key, response, now = Date.now()) {
    entries.set(key, { response, expiresAt: now + ttlMs });
  }

  return { get, set };
}

// Compose the storage key from tenant + route + client key so the same
// Idempotency-Key cannot collide across tenants or endpoints.
export function idempotencyKeyFor({ tenantId, path, clientKey }) {
  return `${tenantId}:${path}:${clientKey}`;
}
