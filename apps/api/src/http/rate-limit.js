// Fixed-window rate limiter. In-memory and per-process: adequate for a single
// node instance; a multi-instance production deployment needs a shared store
// (Redis) — tracked as a follow-up. Pure and injectable-clock for testing.
export function createRateLimiter({ windowMs = 60_000, max = 120 } = {}) {
  const buckets = new Map(); // key -> { count, resetAt }

  function check(key, now = Date.now()) {
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const allowed = bucket.count <= max;
    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);

    return { allowed, remaining, limit: max, retryAfterSec, resetAt: bucket.resetAt };
  }

  // Opportunistic cleanup so the map does not grow unbounded.
  function sweep(now = Date.now()) {
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) {
        buckets.delete(key);
      }
    }
  }

  return { check, sweep };
}
