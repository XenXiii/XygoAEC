import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

test("API responses carry hardened security headers", () => {
  const response = handleApiRequest({
    method: "GET",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    headers: { "x-staged-tenant-id": "tenant-commercial-sim" },
    repository: createMemoryRepository()
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.match(response.headers["content-security-policy"], /default-src 'none'/);
  assert.ok(response.headers["strict-transport-security"].includes("max-age="));
});
