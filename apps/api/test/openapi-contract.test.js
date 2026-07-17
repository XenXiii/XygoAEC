import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";

const spec = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "docs/api/openapi.v1.json"), "utf8"));

const TENANT = "tenant-commercial-sim";
const FINDING = "finding-commercial-a";
const BLUEPRINT = "blueprint-commercial-a";

// The SSE stream is served by the server layer (server.js), not handleApiRequest,
// so it is excluded from the request-level reachability check below.
const SERVER_LAYER_PATHS = new Set(["/v1/tenants/{tenantId}/events/stream"]);

function concrete(pathTemplate) {
  return pathTemplate
    .replace("{tenantId}", TENANT)
    .replace("{findingId}", FINDING)
    .replace("{blueprintId}", BLUEPRINT);
}

test("every documented path+method is implemented (not 404/405)", async () => {
  for (const [pathTemplate, methods] of Object.entries(spec.paths)) {
    if (SERVER_LAYER_PATHS.has(pathTemplate)) {
      continue;
    }
    for (const method of Object.keys(methods)) {
      const usesTenant = pathTemplate.includes("{tenantId}");
      const res = await handleApiRequest({
        method: method.toUpperCase(),
        path: concrete(pathTemplate),
        headers: usesTenant ? { "x-staged-tenant-id": TENANT } : {},
        body: method.toUpperCase() === "POST" ? "{}" : null,
        repository: createMemoryRepository()
      });

      assert.notEqual(res.status, 404, `${method.toUpperCase()} ${pathTemplate} is documented but routes to 404`);
      assert.notEqual(res.status, 405, `${method.toUpperCase()} ${pathTemplate} is documented but method not allowed`);
    }
  }
});

test("documented path set matches the implemented surface (drift guard)", () => {
  // If a route is added or removed, update this list deliberately — this is the
  // guard that caught the blueprint-workspace route being undocumented.
  const expected = [
    "/health",
    "/v1/tenants/{tenantId}/projects",
    "/v1/tenants/{tenantId}/dashboard/executive",
    "/v1/tenants/{tenantId}/blueprint-workspace",
    "/v1/tenants/{tenantId}/platform-blueprints",
    "/v1/tenants/{tenantId}/platform-blueprints/{blueprintId}",
    "/v1/tenants/{tenantId}/issues",
    "/v1/tenants/{tenantId}/rfis",
    "/v1/tenants/{tenantId}/permits",
    "/v1/tenants/{tenantId}/review-sessions",
    "/v1/tenants/{tenantId}/ai-review-runs",
    "/v1/tenants/{tenantId}/ai-findings",
    "/v1/tenants/{tenantId}/ai-findings/{findingId}/disposition",
    "/v1/tenants/{tenantId}/audit-events",
    "/v1/tenants/{tenantId}/audit-events/verify",
    "/v1/tenants/{tenantId}/transfers",
    "/v1/tenants/{tenantId}/events/stream"
  ].sort();

  assert.deepEqual(Object.keys(spec.paths).sort(), expected);
});

test("list endpoints return a pagination block", async () => {
  const res = await handleApiRequest({
    method: "GET",
    path: `/v1/tenants/${TENANT}/projects?limit=1`,
    headers: { "x-staged-tenant-id": TENANT },
    repository: createMemoryRepository()
  });

  assert.equal(res.status, 200);
  assert.ok(res.body.pagination, "expected a pagination block");
  assert.equal(res.body.pagination.limit, 1);
  assert.equal(typeof res.body.pagination.total, "number");
});
