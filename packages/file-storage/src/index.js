import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const DEFAULT_ALLOWED_MIME_TYPES = Object.freeze([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain"
]);

export const FILE_CLASS_SET = new Set([
  "document",
  "evidence",
  "report_attachment",
  "report_photo"
]);

const FILE_STATUS_SET = new Set(["pending_upload", "ready", "deleting", "deleted"]);
const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_SIGNED_URL_TTL_SEC = 300;
const DEFAULT_RETENTION_DAYS = 365;

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function integerSetting(value, label, { defaultValue, minimum, maximum }) {
  const raw = value === undefined || value === null || value === "" ? String(defaultValue) : String(value);
  const parsed = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function booleanSetting(value, label, defaultValue = false) {
  const raw = value === undefined || value === null || value === "" ? String(defaultValue) : String(value);
  if (raw !== "true" && raw !== "false") throw new Error(`${label} must be true or false.`);
  return raw === "true";
}

function isPlaceholder(value) {
  return /^<.*>$/.test(value) || /^(change-?me|replace-?me|example|placeholder|sample|todo|tbd)(?:$|[-_: ])/i.test(value);
}

function normalizedMimeType(value) {
  return requiredString(value, "MIME type").toLowerCase().split(";", 1)[0].trim();
}

function allowedMimeTypes(value) {
  const values = value
    ? String(value).split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
    : [...DEFAULT_ALLOWED_MIME_TYPES];
  if (values.length === 0 || values.some((item) => item.includes("*") || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(item))) {
    throw new Error("XYGO_STORAGE_ALLOWED_MIME_TYPES must contain explicit comma-separated MIME types without wildcards.");
  }
  return [...new Set(values)];
}

function assertS3Configuration(config) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket) || config.bucket.includes("..")) {
    throw new Error("XYGO_STORAGE_BUCKET must be a valid private S3 bucket name.");
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(config.region)) {
    throw new Error("XYGO_STORAGE_REGION must be a valid region identifier.");
  }
  let endpoint;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    throw new Error("XYGO_STORAGE_ENDPOINT must be an absolute HTTPS URL.");
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("XYGO_STORAGE_ENDPOINT must be an HTTPS URL without credentials, query, or fragment.");
  }
  const hostname = endpoint.hostname.toLowerCase();
  if (
    hostname === "localhost" || hostname.startsWith("127.") || hostname === "0.0.0.0" ||
    hostname.endsWith(".local") || hostname.endsWith(".localhost") || hostname.endsWith(".invalid") ||
    hostname.endsWith(".test") || hostname.endsWith(".example") || hostname === "example.com" ||
    hostname === "example.net" || hostname === "example.org" || hostname.endsWith(".example.com") ||
    hostname.endsWith(".example.net") || hostname.endsWith(".example.org")
  ) {
    throw new Error("XYGO_STORAGE_ENDPOINT must not use a local, test, invalid, or reserved hostname.");
  }
  if (config.publicAccess !== "blocked") {
    throw new Error("XYGO_STORAGE_PUBLIC_ACCESS must be blocked.");
  }
  if (config.serverSideEncryption !== "AES256") {
    throw new Error("XYGO_STORAGE_SERVER_SIDE_ENCRYPTION must be AES256.");
  }
  for (const [label, value, minimum] of [
    ["XYGO_STORAGE_ACCESS_KEY_ID", config.accessKeyId, 8],
    ["XYGO_STORAGE_SECRET_ACCESS_KEY", config.secretAccessKey, 16]
  ]) {
    if (!value || value.length < minimum || isPlaceholder(value)) {
      throw new Error(`${label} must be a non-placeholder private credential of at least ${minimum} characters.`);
    }
  }
}

export function storageConfigurationFromEnvironment(env = {}) {
  const driver = String(env.XYGO_STORAGE_DRIVER ?? "local").trim().toLowerCase();
  const common = {
    driver,
    maxFileBytes: integerSetting(env.XYGO_STORAGE_MAX_FILE_BYTES, "XYGO_STORAGE_MAX_FILE_BYTES", {
      defaultValue: DEFAULT_MAX_FILE_BYTES,
      minimum: 1024,
      maximum: 250 * 1024 * 1024
    }),
    signedUrlTtlSec: integerSetting(env.XYGO_STORAGE_SIGNED_URL_TTL_SEC, "XYGO_STORAGE_SIGNED_URL_TTL_SEC", {
      defaultValue: DEFAULT_SIGNED_URL_TTL_SEC,
      minimum: 60,
      maximum: 900
    }),
    retentionDays: integerSetting(env.XYGO_STORAGE_RETENTION_DAYS, "XYGO_STORAGE_RETENTION_DAYS", {
      defaultValue: DEFAULT_RETENTION_DAYS,
      minimum: 1,
      maximum: 3650
    }),
    allowedMimeTypes: allowedMimeTypes(env.XYGO_STORAGE_ALLOWED_MIME_TYPES)
  };

  if (driver === "local") {
    return {
      ...common,
      rootDirectory: path.resolve(env.XYGO_STORAGE_LOCAL_ROOT ?? "infrastructure/staged-data/uploads")
    };
  }
  if (driver !== "s3") throw new Error("XYGO_STORAGE_DRIVER must be local or s3.");

  const config = {
    ...common,
    bucket: requiredString(env.XYGO_STORAGE_BUCKET, "XYGO_STORAGE_BUCKET"),
    region: requiredString(env.XYGO_STORAGE_REGION, "XYGO_STORAGE_REGION"),
    endpoint: requiredString(env.XYGO_STORAGE_ENDPOINT, "XYGO_STORAGE_ENDPOINT"),
    accessKeyId: requiredString(env.XYGO_STORAGE_ACCESS_KEY_ID, "XYGO_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: requiredString(env.XYGO_STORAGE_SECRET_ACCESS_KEY, "XYGO_STORAGE_SECRET_ACCESS_KEY"),
    forcePathStyle: booleanSetting(env.XYGO_STORAGE_FORCE_PATH_STYLE, "XYGO_STORAGE_FORCE_PATH_STYLE", false),
    publicAccess: requiredString(env.XYGO_STORAGE_PUBLIC_ACCESS, "XYGO_STORAGE_PUBLIC_ACCESS"),
    serverSideEncryption: requiredString(
      env.XYGO_STORAGE_SERVER_SIDE_ENCRYPTION,
      "XYGO_STORAGE_SERVER_SIDE_ENCRYPTION"
    )
  };
  assertS3Configuration(config);
  return config;
}

function safeFilename(value) {
  const filename = path.basename(requiredString(value, "Original filename"));
  if (filename.length > 255 || /[\u0000-\u001f\u007f]/.test(filename) || filename === "." || filename === "..") {
    throw new Error("Original filename is invalid or too long.");
  }
  return filename;
}

function tenantPrefix(tenantId) {
  const readable = tenantId.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "tenant";
  const digest = crypto.createHash("sha256").update(tenantId).digest("hex").slice(0, 12);
  return `${readable}-${digest}`;
}

export function validateFileInput(input, configuration) {
  const mimeType = normalizedMimeType(input?.mimeType);
  const sizeBytes = Number(input?.sizeBytes);
  if (!configuration.allowedMimeTypes.includes(mimeType)) {
    throw new Error(`MIME type ${mimeType} is not allowed.`);
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > configuration.maxFileBytes) {
    throw new Error(`File size must be between 1 and ${configuration.maxFileBytes} bytes.`);
  }
  if (!FILE_CLASS_SET.has(input?.fileClass)) throw new Error("File class is not allowed.");
  if (input.fileClass === "report_photo" && !mimeType.startsWith("image/")) {
    throw new Error("Report photos must use an allowed image MIME type.");
  }
  return { mimeType, sizeBytes, originalFilename: safeFilename(input.originalFilename) };
}

export function createPendingFileRecord(input, configuration, { now = new Date(), id = crypto.randomUUID() } = {}) {
  const tenantId = requiredString(input?.tenantId, "File tenantId");
  const projectId = requiredString(input?.projectId, "File projectId");
  const createdBy = requiredString(input?.createdBy, "File createdBy");
  const normalized = validateFileInput(input, configuration);
  const createdAt = now.toISOString();
  const retentionUntil = new Date(now.getTime() + configuration.retentionDays * 86_400_000).toISOString();
  return {
    id,
    tenantId,
    projectId,
    fieldReportId: input.fieldReportId ?? null,
    fileClass: input.fileClass,
    originalFilename: normalized.originalFilename,
    mimeType: normalized.mimeType,
    sizeBytes: normalized.sizeBytes,
    storageKey: `tenants/${tenantPrefix(tenantId)}/files/${id}`,
    status: "pending_upload",
    checksumSha256: null,
    clientVisible: input.clientVisible === true,
    createdBy,
    createdAt,
    updatedAt: createdAt,
    retentionUntil,
    deletedAt: null
  };
}

export function assertFileRecord(record) {
  requiredString(record?.id, "File id");
  requiredString(record?.tenantId, "File tenantId");
  requiredString(record?.storageKey, "File storage key");
  if (!FILE_STATUS_SET.has(record.status)) throw new Error("File status is invalid.");
  return record;
}

export function publicFileMetadata(record) {
  assertFileRecord(record);
  const { storageKey: _storageKey, ...safe } = record;
  return safe;
}

function localObjectPaths(rootDirectory, key) {
  if (!/^tenants\/[a-z0-9_-]+\/[a-z]+\/[a-f0-9-]+$/.test(key)) throw new Error("Storage key is invalid.");
  const objectPath = path.resolve(rootDirectory, key);
  const relative = path.relative(rootDirectory, objectPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Storage key escapes the local root.");
  return { objectPath, metadataPath: `${objectPath}.metadata.json` };
}

async function readLocalMetadata(metadataPath) {
  try {
    return JSON.parse(await fs.readFile(metadataPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function createLocalStorage(configuration) {
  const { rootDirectory } = configuration;
  return {
    driver: "local",
    configuration,
    async checkReadiness() {
      await fs.mkdir(rootDirectory, { recursive: true, mode: 0o700 });
      await fs.access(rootDirectory);
      return { ready: true, driver: "local" };
    },
    async createUploadTarget() {
      return { mode: "authenticated_proxy", method: "PUT", expiresIn: null, url: null, headers: {} };
    },
    async createDownloadTarget() {
      return { mode: "authenticated_proxy", method: "GET", expiresIn: null, url: null, headers: {} };
    },
    async putObject(record, body, contentType) {
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body ?? "");
      if (buffer.length !== record.sizeBytes) throw new Error("Uploaded content length does not match the declared file size.");
      if (normalizedMimeType(contentType) !== record.mimeType) throw new Error("Uploaded content type does not match the declared MIME type.");
      const { objectPath, metadataPath } = localObjectPaths(rootDirectory, record.storageKey);
      await fs.mkdir(path.dirname(objectPath), { recursive: true, mode: 0o700 });
      const suffix = `${process.pid}.${crypto.randomUUID()}.tmp`;
      const objectTemp = `${objectPath}.${suffix}`;
      const metadataTemp = `${metadataPath}.${suffix}`;
      const checksumSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      try {
        await fs.writeFile(objectTemp, buffer, { mode: 0o600 });
        await fs.writeFile(metadataTemp, JSON.stringify({
          tenantId: record.tenantId,
          contentType: record.mimeType,
          sizeBytes: buffer.length,
          checksumSha256
        }), { mode: 0o600 });
        await fs.rename(objectTemp, objectPath);
        await fs.rename(metadataTemp, metadataPath);
      } catch (error) {
        await Promise.allSettled([fs.rm(objectTemp, { force: true }), fs.rm(metadataTemp, { force: true })]);
        throw error;
      }
      return { tenantId: record.tenantId, contentType: record.mimeType, sizeBytes: buffer.length, checksumSha256 };
    },
    async headObject(record) {
      const { objectPath, metadataPath } = localObjectPaths(rootDirectory, record.storageKey);
      const metadata = await readLocalMetadata(metadataPath);
      if (!metadata) return null;
      try {
        const stat = await fs.stat(objectPath);
        return { ...metadata, sizeBytes: stat.size };
      } catch (error) {
        if (error.code === "ENOENT") return null;
        throw error;
      }
    },
    async getObject(record) {
      const head = await this.headObject(record);
      if (!head) return null;
      const { objectPath } = localObjectPaths(rootDirectory, record.storageKey);
      return { ...head, body: await fs.readFile(objectPath) };
    },
    async deleteObject(record) {
      const { objectPath, metadataPath } = localObjectPaths(rootDirectory, record.storageKey);
      await Promise.all([fs.rm(objectPath, { force: true }), fs.rm(metadataPath, { force: true })]);
    },
    async close() {}
  };
}

export function createS3Storage(configuration, { client: injectedClient = null, presign = getSignedUrl } = {}) {
  const client = injectedClient ?? new S3Client({
    region: configuration.region,
    endpoint: configuration.endpoint,
    forcePathStyle: configuration.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey
    }
  });
  const objectInput = (record) => ({ Bucket: configuration.bucket, Key: record.storageKey });
  return {
    driver: "s3",
    configuration,
    async checkReadiness() {
      return { ready: true, driver: "s3", configured: true };
    },
    async createUploadTarget(record) {
      const headers = {
        "content-type": record.mimeType,
        "if-none-match": "*",
        "x-amz-server-side-encryption": configuration.serverSideEncryption,
        "x-amz-meta-xygo-tenant-id": record.tenantId
      };
      const command = new PutObjectCommand({
        ...objectInput(record),
        ContentType: record.mimeType,
        ContentLength: record.sizeBytes,
        IfNoneMatch: "*",
        ServerSideEncryption: configuration.serverSideEncryption,
        Metadata: { "xygo-tenant-id": record.tenantId }
      });
      return {
        mode: "presigned_url",
        method: "PUT",
        url: await presign(client, command, { expiresIn: configuration.signedUrlTtlSec }),
        expiresIn: configuration.signedUrlTtlSec,
        headers
      };
    },
    async createDownloadTarget(record) {
      const disposition = `attachment; filename*=UTF-8''${encodeURIComponent(record.originalFilename)}`;
      const command = new GetObjectCommand({ ...objectInput(record), ResponseContentDisposition: disposition });
      return {
        mode: "presigned_url",
        method: "GET",
        url: await presign(client, command, { expiresIn: configuration.signedUrlTtlSec }),
        expiresIn: configuration.signedUrlTtlSec,
        headers: {}
      };
    },
    async putObject() {
      throw new Error("Direct API uploads are disabled for S3 storage; use the presigned upload target.");
    },
    async headObject(record) {
      try {
        const response = await client.send(new HeadObjectCommand(objectInput(record)));
        return {
          tenantId: response.Metadata?.["xygo-tenant-id"] ?? null,
          contentType: normalizedMimeType(response.ContentType ?? "application/octet-stream"),
          sizeBytes: Number(response.ContentLength),
          checksumSha256: response.ChecksumSHA256 ? Buffer.from(response.ChecksumSHA256, "base64").toString("hex") : null
        };
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === "NotFound") return null;
        throw error;
      }
    },
    async getObject() {
      throw new Error("Direct API downloads are disabled for S3 storage; use the presigned download target.");
    },
    async deleteObject(record) {
      await client.send(new DeleteObjectCommand(objectInput(record)));
    },
    async close() {
      client.destroy?.();
    }
  };
}

export function createStorageFromEnv(env = process.env, options = {}) {
  const configuration = storageConfigurationFromEnvironment(env);
  return configuration.driver === "s3"
    ? createS3Storage(configuration, options)
    : createLocalStorage(configuration);
}
