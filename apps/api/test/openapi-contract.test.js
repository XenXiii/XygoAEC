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
const REPORT = "field-report-commercial-a";
const FILE = "file-openapi-contract";

// The SSE stream is served by the server layer (server.js), not handleApiRequest,
// so it is excluded from the request-level reachability check below.
const SERVER_LAYER_PATHS = new Set(["/v1/tenants/{tenantId}/events/stream"]);

function concrete(pathTemplate) {
  return pathTemplate
    .replace("{tenantId}", TENANT)
    .replace("{findingId}", FINDING)
    .replace("{blueprintId}", BLUEPRINT)
    .replace("{reportId}", REPORT)
    .replace("{fileId}", FILE);
}

function storageFixture() {
  return {
    driver: "local",
    configuration: { maxFileBytes: 1024, allowedMimeTypes: ["image/jpeg"], retentionDays: 365 },
    async createUploadTarget() { return { mode: "authenticated_proxy", method: "PUT", url: null, headers: {} }; },
    async createDownloadTarget() { return { mode: "authenticated_proxy", method: "GET", url: null, headers: {} }; },
    async putObject() {},
    async headObject(record) { return { tenantId: record.tenantId, contentType: record.mimeType, sizeBytes: record.sizeBytes, checksumSha256: "a".repeat(64) }; },
    async getObject(record) { return { tenantId: record.tenantId, contentType: record.mimeType, sizeBytes: 4, body: Buffer.from("jpeg") }; },
    async deleteObject() {}
  };
}

function repositoryFixture(pathTemplate, method) {
  const repository = createMemoryRepository();
  if (pathTemplate.includes("{fileId}")) {
    const pending = method === "post" || method === "put";
    repository.createFileRecord({
      id: FILE,
      tenantId: TENANT,
      projectId: "project-commercial-b",
      fieldReportId: REPORT,
      fileClass: "report_photo",
      originalFilename: "contract.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 4,
      storageKey: "tenants/tenant-contract/files/file-openapi-contract",
      status: pending ? "pending_upload" : "ready",
      checksumSha256: pending ? null : "a".repeat(64),
      clientVisible: true,
      createdBy: "contract-user",
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
      retentionUntil: "2027-08-04T00:00:00.000Z",
      deletedAt: null
    });
  }
  return repository;
}

test("every documented path+method is implemented (not 404/405)", async () => {
  for (const [pathTemplate, methods] of Object.entries(spec.paths)) {
    if (SERVER_LAYER_PATHS.has(pathTemplate)) {
      continue;
    }
    for (const method of Object.keys(methods)) {
      const usesTenant = pathTemplate.includes("{tenantId}");
      const upperMethod = method.toUpperCase();
      const isFileContentPut = upperMethod === "PUT" && pathTemplate.endsWith("/{fileId}/content");
      const res = await handleApiRequest({
        method: upperMethod,
        path: concrete(pathTemplate),
        headers: usesTenant ? { "x-staged-tenant-id": TENANT, ...(isFileContentPut ? { "content-type": "image/jpeg" } : {}) } : {},
        body: isFileContentPut ? Buffer.from("jpeg") : upperMethod === "POST" ? "{}" : null,
        repository: repositoryFixture(pathTemplate, method),
        storage: storageFixture()
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
    "/v1/tenants/{tenantId}/field-reports",
    "/v1/tenants/{tenantId}/field-reports/{reportId}",
    "/v1/tenants/{tenantId}/field-reports/{reportId}/draft",
    "/v1/tenants/{tenantId}/field-reports/{reportId}/review",
    "/v1/tenants/{tenantId}/files",
    "/v1/tenants/{tenantId}/files/upload-intents",
    "/v1/tenants/{tenantId}/files/{fileId}",
    "/v1/tenants/{tenantId}/files/{fileId}/complete",
    "/v1/tenants/{tenantId}/files/{fileId}/download",
    "/v1/tenants/{tenantId}/files/{fileId}/content",
    "/v1/tenants/{tenantId}/client-portal",
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
