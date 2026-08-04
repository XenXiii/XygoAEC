import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import assert from "node:assert/strict";

import { handleApiRequest } from "../src/handlers.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createServer } from "../src/server.js";
import { createLocalStorage, storageConfigurationFromEnvironment } from "../../../packages/file-storage/src/index.js";

const TENANT_A = "tenant-commercial-sim";
const TENANT_B = "tenant-residential-sim";
const PROJECT_A = "project-commercial-b";
const REPORT_A = "field-report-commercial-b";
const OIDC = { mode: "oidc", oidc: {} };

function principal(tenantId, organizationRole = "client_owner") {
  return {
    userId: `user-${tenantId}-${organizationRole}`,
    tenantId,
    organizationRole,
    projectRole: null,
    authenticated: true,
    staged: false
  };
}

function createHarness(t) {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-file-api-"));
  t.after(() => fs.rmSync(rootDirectory, { recursive: true, force: true }));
  const storage = createLocalStorage(storageConfigurationFromEnvironment({
    XYGO_STORAGE_LOCAL_ROOT: rootDirectory,
    XYGO_STORAGE_MAX_FILE_BYTES: "1024"
  }));
  const repository = createMemoryRepository();
  const request = (method, route, { actor = principal(TENANT_A), body = null, headers = {} } = {}) =>
    handleApiRequest({
      method,
      path: route,
      body,
      headers,
      repository,
      storage,
      principal: actor,
      authConfig: OIDC
    });
  return { repository, storage, request };
}

function uploadIntentBody(overrides = {}) {
  return JSON.stringify({
    projectId: PROJECT_A,
    fieldReportId: REPORT_A,
    fileClass: "report_photo",
    originalFilename: "south-core.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 4,
    clientVisible: true,
    ...overrides
  });
}

function dispatchServerRequest(server, { method, url, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const request = new PassThrough();
    Object.assign(request, { method, url, headers, socket: { remoteAddress: "127.0.0.1" } });
    const response = new EventEmitter();
    response.headersSent = false;
    response.statusCode = 200;
    response.headers = {};
    response.setHeader = (name, value) => { response.headers[String(name).toLowerCase()] = value; };
    response.writeHead = (status, nextHeaders = {}) => {
      response.statusCode = status;
      response.headersSent = true;
      for (const [name, value] of Object.entries(nextHeaders)) response.headers[name.toLowerCase()] = value;
    };
    response.end = (value = Buffer.alloc(0)) => {
      response.body = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
      response.emit("finish");
      resolve(response);
    };
    server.emit("request", request, response);
    request.on("error", reject);
    request.end(body ?? undefined);
  });
}

test("tenant file flow links report evidence, persists metadata/audit, and cleans up", async (t) => {
  const { repository, storage, request } = createHarness(t);
  const intent = await request("POST", `/v1/tenants/${TENANT_A}/files/upload-intents`, {
    body: uploadIntentBody()
  });
  assert.equal(intent.status, 201);
  assert.equal(intent.body.item.fieldReportId, REPORT_A);
  assert.equal(intent.body.item.storageKey, undefined);
  assert.equal(intent.body.upload.mode, "authenticated_proxy");
  const fileId = intent.body.item.id;

  const crossTenantRead = await request("GET", `/v1/tenants/${TENANT_B}/files/${fileId}/download`, {
    actor: principal(TENANT_B)
  });
  assert.equal(crossTenantRead.status, 404);
  const wrongPrincipal = await request("PUT", `/v1/tenants/${TENANT_A}/files/${fileId}/content`, {
    actor: principal(TENANT_B),
    body: Buffer.from("jpeg"),
    headers: { "content-type": "image/jpeg" }
  });
  assert.equal(wrongPrincipal.status, 403);

  const uploaded = await request("PUT", `/v1/tenants/${TENANT_A}/files/${fileId}/content`, {
    body: Buffer.from("jpeg"),
    headers: { "content-type": "image/jpeg" }
  });
  assert.equal(uploaded.status, 200);
  assert.equal(uploaded.body.item.status, "ready");
  assert.match(uploaded.body.item.checksumSha256, /^[a-f0-9]{64}$/);

  const persisted = repository.getFileRecordById(fileId);
  assert.equal(persisted.tenantId, TENANT_A);
  assert.equal(persisted.projectId, PROJECT_A);
  assert.equal(persisted.fieldReportId, REPORT_A);
  const uploadAudit = repository.listAuditEventsByTenant(TENANT_A).find((event) => event.resourceId === fileId);
  assert.equal(uploadAudit.action, "api.file.upload_completed");
  assert.match(uploadAudit.afterStateRef, /^sha256:/);

  const portal = await request("GET", `/v1/tenants/${TENANT_A}/client-portal`);
  const projectPortal = portal.body.items.find((item) => item.projectId === PROJECT_A);
  assert.ok(projectPortal.files.some((file) => file.id === fileId && file.downloadPath.endsWith(`/${fileId}/download`)));

  const download = await request("GET", `/v1/tenants/${TENANT_A}/files/${fileId}/download`, {
    actor: principal(TENANT_A, "client_viewer")
  });
  assert.equal(download.status, 200);
  assert.equal(download.body.download.mode, "authenticated_proxy");
  const content = await request("GET", `/v1/tenants/${TENANT_A}/files/${fileId}/content`, {
    actor: principal(TENANT_A, "client_viewer")
  });
  assert.equal(content.status, 200);
  assert.equal(content.body.toString("utf8"), "jpeg");

  const overwrite = await request("PUT", `/v1/tenants/${TENANT_A}/files/${fileId}/content`, {
    body: Buffer.from("jpeg"),
    headers: { "content-type": "image/jpeg" }
  });
  assert.equal(overwrite.status, 400);

  const deniedDelete = await request("DELETE", `/v1/tenants/${TENANT_A}/files/${fileId}`, {
    actor: principal(TENANT_A, "client_viewer")
  });
  assert.equal(deniedDelete.status, 403);
  const deleted = await request("DELETE", `/v1/tenants/${TENANT_A}/files/${fileId}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.item.status, "deleted");
  assert.equal(await storage.headObject(persisted), null);
  assert.ok(repository.listAuditEventsByTenant(TENANT_A).some(
    (event) => event.resourceId === fileId && event.action === "api.file.deleted"
  ));
  const afterDelete = await request("GET", `/v1/tenants/${TENANT_A}/files/${fileId}/content`);
  assert.equal(afterDelete.status, 404);
});

test("file intent validation rejects unsafe types, sizes, and cross-tenant relationships", async (t) => {
  const { request } = createHarness(t);
  const executable = await request("POST", `/v1/tenants/${TENANT_A}/files/upload-intents`, {
    body: uploadIntentBody({ mimeType: "text/html" })
  });
  assert.equal(executable.status, 400);
  const tooLarge = await request("POST", `/v1/tenants/${TENANT_A}/files/upload-intents`, {
    body: uploadIntentBody({ sizeBytes: 1025 })
  });
  assert.equal(tooLarge.status, 400);
  const wrongProject = await request("POST", `/v1/tenants/${TENANT_A}/files/upload-intents`, {
    body: uploadIntentBody({ projectId: "project-residential-a" })
  });
  assert.equal(wrongProject.status, 403);
  const missingReport = await request("POST", `/v1/tenants/${TENANT_A}/files/upload-intents`, {
    body: uploadIntentBody({ fieldReportId: null })
  });
  assert.equal(missingReport.status, 400);
  const unpublishedReport = await request("POST", `/v1/tenants/${TENANT_A}/files/upload-intents`, {
    actor: principal(TENANT_A, "client_staff"),
    body: uploadIntentBody({ fieldReportId: "field-report-commercial-a", clientVisible: true })
  });
  assert.equal(unpublishedReport.status, 403);
  const approvedReport = await request("POST", `/v1/tenants/${TENANT_A}/files/upload-intents`, {
    actor: principal(TENANT_A, "client_staff"),
    body: uploadIntentBody({ clientVisible: true })
  });
  assert.equal(approvedReport.status, 201);
  const wrongBytes = await request(
    "PUT",
    `/v1/tenants/${TENANT_A}/files/${approvedReport.body.item.id}/content`,
    { body: Buffer.from("bad"), headers: { "content-type": "image/jpeg" } }
  );
  assert.equal(wrongBytes.status, 400);
  const wrongContentType = await request(
    "PUT",
    `/v1/tenants/${TENANT_A}/files/${approvedReport.body.item.id}/content`,
    { body: Buffer.from("jpeg"), headers: { "content-type": "application/pdf" } }
  );
  assert.equal(wrongContentType.status, 400);
});

test("client viewers see only ready client-visible files", async (t) => {
  const { request } = createHarness(t);
  const hidden = await request("POST", `/v1/tenants/${TENANT_A}/files/upload-intents`, {
    body: uploadIntentBody({ clientVisible: false, originalFilename: "internal.jpg" })
  });
  assert.equal(hidden.status, 201);
  const viewerList = await request("GET", `/v1/tenants/${TENANT_A}/files`, {
    actor: principal(TENANT_A, "client_viewer")
  });
  assert.equal(viewerList.status, 200);
  assert.ok(!viewerList.body.items.some((item) => item.id === hidden.body.item.id));
  const viewerDownload = await request("GET", `/v1/tenants/${TENANT_A}/files/${hidden.body.item.id}/download`, {
    actor: principal(TENANT_A, "client_viewer")
  });
  assert.equal(viewerDownload.status, 404);
});

test("delete rolls back storage failures and leaves finalization failures retryable", async (t) => {
  const { repository, storage, request } = createHarness(t);
  const intent = await request("POST", `/v1/tenants/${TENANT_A}/files/upload-intents`, { body: uploadIntentBody() });
  const fileId = intent.body.item.id;
  await request("PUT", `/v1/tenants/${TENANT_A}/files/${fileId}/content`, {
    body: Buffer.from("jpeg"),
    headers: { "content-type": "image/jpeg" }
  });

  const deleteObject = storage.deleteObject.bind(storage);
  storage.deleteObject = async () => { throw new Error("object store unavailable"); };
  const storageFailure = await request("DELETE", `/v1/tenants/${TENANT_A}/files/${fileId}`);
  assert.equal(storageFailure.status, 503);
  assert.equal(storageFailure.body.error, "file_storage_unavailable");
  assert.equal(repository.getFileRecordById(fileId).status, "ready");
  assert.ok(await storage.headObject(repository.getFileRecordById(fileId)));

  storage.deleteObject = deleteObject;
  const finalize = repository.finalizeFileRecord.bind(repository);
  let failOnce = true;
  repository.finalizeFileRecord = (input) => {
    if (failOnce) {
      failOnce = false;
      throw new Error("database temporarily unavailable");
    }
    return finalize(input);
  };
  const finalizationFailure = await request("DELETE", `/v1/tenants/${TENANT_A}/files/${fileId}`);
  assert.equal(finalizationFailure.status, 503);
  assert.equal(repository.getFileRecordById(fileId).status, "deleting");
  const retry = await request("DELETE", `/v1/tenants/${TENANT_A}/files/${fileId}`);
  assert.equal(retry.status, 200);
  assert.equal(repository.getFileRecordById(fileId).status, "deleted");
});

test("HTTP server request pipeline preserves binary local upload and download bodies", async (t) => {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-file-http-"));
  t.after(() => fs.rmSync(rootDirectory, { recursive: true, force: true }));
  const storage = createLocalStorage(storageConfigurationFromEnvironment({ XYGO_STORAGE_LOCAL_ROOT: rootDirectory }));
  const server = createServer({
    env: { NODE_ENV: "test", STAGED_MODE: "true", XYGO_API_REPOSITORY_MODE: "memory" },
    repository: createMemoryRepository(),
    storage,
    logger: { info() {}, warn() {}, error() {} }
  });
  await server.checkReadiness();
  t.after(() => server.closeRepository());
  const tenantHeaders = { "x-staged-tenant-id": TENANT_A };

  const intentResponse = await dispatchServerRequest(server, {
    method: "POST",
    url: `/v1/tenants/${TENANT_A}/files/upload-intents`,
    headers: { ...tenantHeaders, "content-type": "application/json" },
    body: uploadIntentBody()
  });
  assert.equal(intentResponse.statusCode, 201);
  const intent = JSON.parse(intentResponse.body);
  const uploadResponse = await dispatchServerRequest(server, {
    method: "PUT",
    url: intent.upload.url,
    headers: { ...tenantHeaders, "content-type": "image/jpeg" },
    body: Buffer.from("jpeg")
  });
  assert.equal(uploadResponse.statusCode, 200);
  const contentResponse = await dispatchServerRequest(server, {
    method: "GET",
    url: `/v1/tenants/${TENANT_A}/files/${intent.item.id}/content`,
    headers: tenantHeaders
  });
  assert.equal(contentResponse.statusCode, 200);
  assert.equal(contentResponse.headers["cache-control"], "private, no-store");
  assert.equal(contentResponse.body.toString("utf8"), "jpeg");
});
