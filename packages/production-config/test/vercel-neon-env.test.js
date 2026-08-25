import assert from "node:assert/strict";
import test from "node:test";

import { withVercelNeonAliases } from "../../../config/vercel-neon-env.js";

test("maps Vercel Neon server secrets to Xygo's canonical Postgres variables", () => {
  const env = withVercelNeonAliases({
    XYGO_API_PG_POSTGRES_URL: "postgresql://example.invalid/db?sslmode=require"
  });

  assert.equal(env.XYGO_API_PG_URL, env.XYGO_API_PG_POSTGRES_URL);
  assert.equal(env.XYGO_WEB_SESSION_PG_URL, env.XYGO_API_PG_POSTGRES_URL);
});

test("does not override explicitly configured canonical Postgres variables", () => {
  const env = withVercelNeonAliases({
    XYGO_API_PG_POSTGRES_URL: "postgresql://integration.invalid/db?sslmode=require",
    XYGO_API_PG_URL: "postgresql://api.invalid/db?sslmode=verify-full",
    XYGO_WEB_SESSION_PG_URL: "postgresql://web.invalid/db?sslmode=verify-full"
  });

  assert.equal(env.XYGO_API_PG_URL, "postgresql://api.invalid/db?sslmode=verify-full");
  assert.equal(env.XYGO_WEB_SESSION_PG_URL, "postgresql://web.invalid/db?sslmode=verify-full");
});

test("returns a copy and never mutates the deployment environment", () => {
  const original = {
    XYGO_API_PG_POSTGRES_URL: "postgresql://example.invalid/db?sslmode=require"
  };

  const env = withVercelNeonAliases(original);

  assert.notEqual(env, original);
  assert.equal(original.XYGO_API_PG_URL, undefined);
  assert.equal(original.XYGO_WEB_SESSION_PG_URL, undefined);
});
