import test from "node:test";
import assert from "node:assert/strict";

import { createRateLimiter } from "../src/http/rate-limit.js";

test("rate limiter allows up to the max then blocks within a window", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
  const t0 = 1_000_000;

  assert.equal(limiter.check("k", t0).allowed, true);
  assert.equal(limiter.check("k", t0).allowed, true);
  const third = limiter.check("k", t0);
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  const fourth = limiter.check("k", t0);
  assert.equal(fourth.allowed, false);
  assert.ok(fourth.retryAfterSec > 0 && fourth.retryAfterSec <= 60);
});

test("rate limiter resets after the window elapses", () => {
  const limiter = createRateLimiter({ windowMs: 1_000, max: 1 });
  assert.equal(limiter.check("k", 0).allowed, true);
  assert.equal(limiter.check("k", 500).allowed, false);
  assert.equal(limiter.check("k", 1_000).allowed, true);
});

test("rate limiter isolates keys", () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  assert.equal(limiter.check("a", 0).allowed, true);
  assert.equal(limiter.check("b", 0).allowed, true);
  assert.equal(limiter.check("a", 0).allowed, false);
});
