import test from "node:test";
import assert from "node:assert/strict";

import { createSyntheticSession } from "../../auth/src/synthetic-auth.js";
import {
  checkOutFile,
  createFileRecord,
  createFileRevision,
  emitFileAudit,
  validateFileUpload
} from "../src/index.js";

test("file records reject unknown classes", () => {
  assert.throws(
    () =>
      createFileRecord({
        id: "file-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        fileClass: "mystery",
        originalFilename: "a.pdf",
        mimeType: "application/pdf",
        detectedType: "pdf",
        storageKey: "files/a.pdf",
        staged: true
      }),
    /Unknown file class/
  );
});

test("file revisions preserve superseded linkage", () => {
  const file = createFileRecord({
    id: "file-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    fileClass: "drawing_source",
    originalFilename: "a.pdf",
    mimeType: "application/pdf",
    detectedType: "pdf",
    storageKey: "files/a.pdf",
    staged: true
  });
  const revision = createFileRevision(file, {
    id: "file-b",
    storageKey: "files/a-v2.pdf"
  });

  assert.equal(revision.supersededFileId, "file-a");
});

test("file validation enforces type and size limits", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const file = createFileRecord({
    id: "file-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    fileClass: "drawing_source",
    originalFilename: "a.pdf",
    mimeType: "application/pdf",
    detectedType: "pdf",
    storageKey: "files/a.pdf",
    sizeBytes: 1024,
    staged: true
  });
  const validated = validateFileUpload({
    session,
    fileRecord: file,
    allowedMimeTypes: ["application/pdf"],
    maxSizeBytes: 2048
  });

  assert.equal(validated.validationState, "valid");
});

test("approved historical files cannot be checked out in place", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const file = createFileRecord({
    id: "file-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    fileClass: "design_file",
    originalFilename: "a.ifc",
    mimeType: "application/octet-stream",
    detectedType: "ifc",
    storageKey: "files/a.ifc",
    lifecycleStatus: "approved",
    staged: true
  });

  assert.throws(() => checkOutFile({ session, fileRecord: file }), /cannot be mutated in place/);
});

test("file audit emits audit and outbox events", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const file = createFileRecord({
    id: "file-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    fileClass: "general_document",
    originalFilename: "a.txt",
    mimeType: "text/plain",
    detectedType: "txt",
    storageKey: "files/a.txt",
    staged: true
  });
  const result = emitFileAudit({
    session,
    fileRecord: file,
    action: "uploaded"
  });

  assert.equal(result.auditEvent.action, "uploaded");
  assert.equal(result.outboxEvent.eventType, "document.uploaded");
});
