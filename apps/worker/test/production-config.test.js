import test from "node:test";
import assert from "node:assert/strict";

import { createWorker } from "../src/worker.js";
import { validProductionEnvironment } from "../../../packages/production-config/test/fixtures.js";

test("production worker construction fails before start when the manifest is incomplete", () => {
  assert.throws(
    () => createWorker({ env: { NODE_ENV: "production" } }),
    /Production worker configuration error.*STAGED_MODE/
  );
});

test("production worker construction accepts a complete validated manifest", () => {
  const worker = createWorker({ env: validProductionEnvironment(), handler: async () => {} });
  assert.equal(typeof worker.start, "function");
  assert.equal(typeof worker.tick, "function");
});
