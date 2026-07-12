import crypto from "node:crypto";

import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";
import { assertProjectAccess, assertSessionTenantAccess } from "../../auth/src/synthetic-auth.js";

const FILE_CLASS_SET = new Set([
  "general_document",
  "design_file",
  "drawing_source",
  "model_source",
  "review_artifact",
  "permit_document"
]);

const FILE_STATUS_SET = new Set([
  "uploaded",
  "quarantined",
  "validated",
  "checked_out",
  "approved",
  "superseded"
]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function createFileRecord(input) {
  requiredString(input?.id, "File record id");
  requiredString(input?.tenantId, "File record tenantId");
  requiredString(input?.projectId, "File record projectId");
  requiredString(input?.fileClass, "File record fileClass");
  requiredString(input?.originalFilename, "File record originalFilename");
  requiredString(input?.mimeType, "File record mimeType");
  requiredString(input?.detectedType, "File record detectedType");
  requiredString(input?.storageKey, "File record storageKey");

  if (!FILE_CLASS_SET.has(input.fileClass)) {
    throw new Error(`Unknown file class: ${input.fileClass}`);
  }

  if (input?.staged !== true) {
    throw new Error("File records must be staged synthetic records.");
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    discipline: input.discipline ?? null,
    fileClass: input.fileClass,
    originalFilename: input.originalFilename,
    safeFilename: input.safeFilename ?? input.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_"),
    mimeType: input.mimeType,
    detectedType: input.detectedType,
    sizeBytes: input.sizeBytes ?? 0,
    storageKey: input.storageKey,
    revision: input.revision ?? "A",
    lifecycleStatus: input.lifecycleStatus ?? "uploaded",
    visibilityClass: input.visibilityClass ?? "project_only",
    integrityHash: input.integrityHash ?? sha256(`${input.storageKey}:${input.originalFilename}`),
    validationState: input.validationState ?? "pending",
    malwareScanState: input.malwareScanState ?? "pending",
    staged: true
  };
}

export function createFileRevision(previousRecord, input) {
  requiredString(input?.id, "File revision id");
  requiredString(input?.storageKey, "File revision storageKey");

  const nextRevision = input.revision ?? `${previousRecord.revision}.1`;

  return {
    ...previousRecord,
    id: input.id,
    storageKey: input.storageKey,
    revision: nextRevision,
    lifecycleStatus: input.lifecycleStatus ?? "uploaded",
    supersededFileId: previousRecord.id,
    integrityHash: input.integrityHash ?? sha256(`${input.storageKey}:${nextRevision}`),
    validationState: input.validationState ?? "pending",
    malwareScanState: input.malwareScanState ?? "pending"
  };
}

export function checkOutFile({ session, fileRecord }) {
  assertSessionTenantAccess(session, fileRecord.tenantId);
  assertProjectAccess(session, fileRecord.projectId);

  if (fileRecord.lifecycleStatus === "approved") {
    throw new Error("Approved historical files cannot be mutated in place.");
  }

  return {
    ...fileRecord,
    lifecycleStatus: "checked_out"
  };
}

export function validateFileUpload({ session, fileRecord, allowedMimeTypes, maxSizeBytes }) {
  assertSessionTenantAccess(session, fileRecord.tenantId);
  assertProjectAccess(session, fileRecord.projectId);

  if (!allowedMimeTypes.includes(fileRecord.mimeType)) {
    throw new Error("Upload rejected: MIME type is not allowed.");
  }

  if (fileRecord.sizeBytes > maxSizeBytes) {
    throw new Error("Upload rejected: file exceeds staged size limit.");
  }

  return {
    ...fileRecord,
    validationState: "valid",
    malwareScanState: "clean",
    lifecycleStatus: FILE_STATUS_SET.has(fileRecord.lifecycleStatus)
      ? fileRecord.lifecycleStatus
      : "validated"
  };
}

export function emitFileAudit({ session, fileRecord, action }) {
  return {
    auditEvent: createAuditEvent({
      tenantId: fileRecord.tenantId,
      actorType: "user",
      actorId: session.userId,
      action,
      resourceType: "file_record",
      resourceId: fileRecord.id
    }),
    outboxEvent: createOutboxEvent({
      eventType: `document.${action}`,
      aggregateType: "file_record",
      aggregateId: fileRecord.id,
      tenantId: fileRecord.tenantId,
      payload: {
        projectId: fileRecord.projectId,
        revision: fileRecord.revision
      }
    })
  };
}
