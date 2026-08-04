import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createLocalStorage,
  createPendingFileRecord,
  createS3Storage,
  publicFileMetadata,
  storageConfigurationFromEnvironment
} from "../src/index.js";

function s3Environment(overrides = {}) {
  return {
    XYGO_STORAGE_DRIVER: "s3",
    XYGO_STORAGE_BUCKET: "xygo-private-uploads",
    XYGO_STORAGE_REGION: "us-east-1",
    XYGO_STORAGE_ENDPOINT: "https://storage.xygoaec.com",
    XYGO_STORAGE_ACCESS_KEY_ID: "storage-access-key",
    XYGO_STORAGE_SECRET_ACCESS_KEY: "storage-secret-at-least-16-characters",
    XYGO_STORAGE_FORCE_PATH_STYLE: "false",
    XYGO_STORAGE_PUBLIC_ACCESS: "blocked",
    XYGO_STORAGE_SERVER_SIDE_ENCRYPTION: "AES256",
    XYGO_STORAGE_MAX_FILE_BYTES: "26214400",
    XYGO_STORAGE_ALLOWED_MIME_TYPES: "application/pdf,image/jpeg,image/png,image/webp,text/plain",
    XYGO_STORAGE_SIGNED_URL_TTL_SEC: "300",
    XYGO_STORAGE_RETENTION_DAYS: "365",
    ...overrides
  };
}

function fileInput(overrides = {}) {
  return {
    tenantId: "tenant-storage-a",
    projectId: "project-storage-a",
    fieldReportId: "report-storage-a",
    fileClass: "report_photo",
    originalFilename: "site-photo.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 4,
    clientVisible: true,
    createdBy: "user-storage-a",
    ...overrides
  };
}

test("storage configuration defaults to private local development and rejects unsafe S3 settings", () => {
  const local = storageConfigurationFromEnvironment({});
  assert.equal(local.driver, "local");
  assert.equal(local.maxFileBytes, 25 * 1024 * 1024);
  assert.ok(local.allowedMimeTypes.includes("image/jpeg"));

  for (const overrides of [
    { XYGO_STORAGE_PUBLIC_ACCESS: "public" },
    { XYGO_STORAGE_ENDPOINT: "http://storage.xygoaec.com" },
    { XYGO_STORAGE_ENDPOINT: "https://storage.example" },
    { XYGO_STORAGE_SECRET_ACCESS_KEY: "<secret>" },
    { XYGO_STORAGE_ALLOWED_MIME_TYPES: "image/*" },
    { XYGO_STORAGE_SIGNED_URL_TTL_SEC: "3600" }
  ]) {
    assert.throws(() => storageConfigurationFromEnvironment(s3Environment(overrides)));
  }
});

test("file metadata uses a tenant-prefixed opaque key and enforces MIME, class, and size", () => {
  const configuration = storageConfigurationFromEnvironment({});
  const record = createPendingFileRecord(fileInput(), configuration, {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    now: new Date("2026-08-04T00:00:00.000Z")
  });
  assert.match(record.storageKey, /^tenants\/tenant-storage-a-[a-f0-9]{12}\/files\/aaaaaaaa-/);
  assert.equal(record.status, "pending_upload");
  assert.equal(record.retentionUntil, "2027-08-04T00:00:00.000Z");
  assert.equal(publicFileMetadata(record).storageKey, undefined);

  assert.throws(() => createPendingFileRecord(fileInput({ mimeType: "text/html" }), configuration), /not allowed/);
  assert.throws(() => createPendingFileRecord(fileInput({ mimeType: "application/pdf" }), configuration), /photos must use/);
  assert.throws(() => createPendingFileRecord(fileInput({ sizeBytes: configuration.maxFileBytes + 1 }), configuration), /File size/);
  assert.throws(() => createPendingFileRecord(fileInput({ fileClass: "executable" }), configuration), /File class/);
});

test("local storage persists, verifies, reads, and deletes tenant-tagged bytes", async (t) => {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "xygo-local-storage-"));
  t.after(() => fs.rmSync(rootDirectory, { recursive: true, force: true }));
  const configuration = storageConfigurationFromEnvironment({ XYGO_STORAGE_LOCAL_ROOT: rootDirectory });
  const storage = createLocalStorage(configuration);
  const record = createPendingFileRecord(fileInput(), configuration, { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
  await storage.checkReadiness();
  await storage.putObject(record, Buffer.from("jpeg"), "image/jpeg");

  const head = await storage.headObject(record);
  assert.equal(head.tenantId, record.tenantId);
  assert.equal(head.sizeBytes, 4);
  assert.match(head.checksumSha256, /^[a-f0-9]{64}$/);
  const object = await storage.getObject(record);
  assert.equal(object.body.toString("utf8"), "jpeg");

  await storage.deleteObject(record);
  assert.equal(await storage.headObject(record), null);
});

test("S3 storage emits short-lived presigned targets with required private-object headers", async () => {
  const configuration = storageConfigurationFromEnvironment(s3Environment());
  const commands = [];
  const fakeClient = { destroy() {}, async send(command) { commands.push(command); return {}; } };
  const storage = createS3Storage(configuration, {
    client: fakeClient,
    presign: async (_client, command, options) => {
      commands.push(command);
      assert.equal(options.expiresIn, 300);
      return `https://signed.xygoaec.com/${command.constructor.name}`;
    }
  });
  const record = createPendingFileRecord(fileInput(), configuration, { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" });
  const upload = await storage.createUploadTarget(record);
  const download = await storage.createDownloadTarget({ ...record, status: "ready" });

  assert.equal(upload.mode, "presigned_url");
  assert.equal(upload.method, "PUT");
  assert.equal(upload.headers["if-none-match"], "*");
  assert.equal(upload.headers["x-amz-server-side-encryption"], "AES256");
  assert.equal(upload.headers["x-amz-meta-xygo-tenant-id"], record.tenantId);
  assert.equal(download.method, "GET");
  assert.ok(commands.some((command) => command.constructor.name === "PutObjectCommand"));
  assert.ok(commands.some((command) => command.constructor.name === "GetObjectCommand"));
  assert.ok(!JSON.stringify({ upload, download }).includes(configuration.secretAccessKey));
});

test("official S3 presigner binds upload length and encryption without an empty-body checksum", async () => {
  const configuration = storageConfigurationFromEnvironment(s3Environment());
  const storage = createS3Storage(configuration);
  const record = createPendingFileRecord(fileInput(), configuration, { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" });
  const target = await storage.createUploadTarget(record);
  await storage.close();
  const url = new URL(target.url);
  assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
  assert.match(url.searchParams.get("X-Amz-SignedHeaders"), /content-length/);
  assert.match(url.searchParams.get("X-Amz-SignedHeaders"), /if-none-match/);
  assert.match(url.searchParams.get("X-Amz-SignedHeaders"), /x-amz-server-side-encryption/);
  assert.equal(url.searchParams.has("x-amz-checksum-crc32"), false);
  assert.equal(target.url.includes(configuration.secretAccessKey), false);
});
