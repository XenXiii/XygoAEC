import test from "node:test";
import assert from "node:assert/strict";

import { createServer } from "../src/server.js";
import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { validProductionEnvironment } from "../../../packages/production-config/test/fixtures.js";

test("production API server construction fails before boot when the manifest is incomplete", () => {
  assert.throws(
    () => createServer({ env: { NODE_ENV: "production" } }),
    /Production API configuration error.*STAGED_MODE/
  );
});

test("production API server construction accepts a complete validated manifest", () => {
  const server = createServer({
    env: validProductionEnvironment(),
    repository: createMemoryRepository(),
    jwks: { getKey: async () => null }
  });
  assert.equal(typeof server.listen, "function");
});

test("configured audit signing material is used for API write evidence", async () => {
  const repository = createMemoryRepository();
  const auditSigningKey = validProductionEnvironment().XYGO_AUDIT_SIGNING_KEY;
  const response = await handleApiRequest({
    method: "POST",
    path: "/v1/tenants/tenant-commercial-sim/projects",
    headers: { "x-staged-tenant-id": "tenant-commercial-sim" },
    body: JSON.stringify({ id: "project-production-signing", name: "Signed Audit Project" }),
    repository,
    auditSigningKey
  });
  assert.equal(response.status, 201);
  const event = (await repository.listAuditEventsByTenant("tenant-commercial-sim"))
    .find((candidate) => candidate.resourceId === "project-production-signing");
  assert.equal(typeof event.signature, "string");
  assert.ok(event.signature.length > 0);
});
