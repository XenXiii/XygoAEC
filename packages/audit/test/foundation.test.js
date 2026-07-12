import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuditVerificationReport,
  createAuditEvent,
  createOutboxEvent,
  verifyAuditChain
} from "../src/foundation.js";

test("audit events require the core fields", () => {
  assert.throws(() => createAuditEvent({ tenantId: "tenant-a" }), /require tenantId/);
});

test("audit events are hash chained", () => {
  const eventA = createAuditEvent({
    tenantId: "tenant-a",
    actorType: "user",
    actorId: "user-a",
    action: "project.created",
    resourceType: "project",
    resourceId: "project-a"
  });
  const eventB = createAuditEvent({
    tenantId: "tenant-a",
    actorType: "user",
    actorId: "user-a",
    action: "project.updated",
    resourceType: "project",
    resourceId: "project-a",
    previousHash: eventA.eventHash
  });

  const result = verifyAuditChain([eventA, eventB]);
  assert.equal(result.valid, true);
});

test("audit chain verification fails for tampered events", () => {
  const eventA = createAuditEvent({
    tenantId: "tenant-a",
    action: "membership.created",
    resourceType: "membership",
    resourceId: "membership-a"
  });
  const eventB = createAuditEvent({
    tenantId: "tenant-a",
    action: "membership.updated",
    resourceType: "membership",
    resourceId: "membership-a",
    previousHash: eventA.eventHash
  });

  const tampered = { ...eventB, action: "membership.deleted" };
  const result = verifyAuditChain([eventA, tampered]);

  assert.equal(result.valid, false);
  assert.equal(result.reason, "hash_mismatch");
});

test("outbox events are staged and pending", () => {
  const event = createOutboxEvent({
    eventType: "project.created",
    aggregateType: "project",
    aggregateId: "project-a",
    tenantId: "tenant-a",
    payload: {
      name: "Project A"
    }
  });

  assert.equal(event.staged, true);
  assert.equal(event.status, "pending");
});

test("audit verification reports summarize chain checks", () => {
  const eventA = createAuditEvent({
    tenantId: "tenant-a",
    action: "sample.created",
    resourceType: "sample",
    resourceId: "sample-a"
  });
  const report = buildAuditVerificationReport([eventA]);

  assert.equal(report.valid, true);
  assert.equal(report.checkedEventCount, 1);
});

test("audit verification reports the specific tampered event id", () => {
  const eventA = createAuditEvent({
    tenantId: "tenant-a",
    action: "project.created",
    resourceType: "project",
    resourceId: "project-a"
  });
  const eventB = createAuditEvent({
    tenantId: "tenant-a",
    action: "project.updated",
    resourceType: "project",
    resourceId: "project-a",
    previousHash: eventA.eventHash
  });

  const tampered = { ...eventB, resourceId: "project-hijacked" };
  const report = buildAuditVerificationReport([eventA, tampered]);

  assert.equal(report.valid, false);
  assert.equal(report.reason, "hash_mismatch");
  assert.equal(report.eventId, eventB.eventId);
});

test("audit verification detects a broken previousHash link", () => {
  const eventA = createAuditEvent({
    tenantId: "tenant-a",
    action: "project.created",
    resourceType: "project",
    resourceId: "project-a"
  });
  const eventB = createAuditEvent({
    tenantId: "tenant-a",
    action: "project.updated",
    resourceType: "project",
    resourceId: "project-a",
    previousHash: eventA.eventHash
  });

  // Drop eventA: eventB's previousHash no longer matches the recomputed genesis link.
  const result = verifyAuditChain([eventB]);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "hash_mismatch");
});

test("audit hashing covers nested object state refs (no silent collision)", () => {
  const base = {
    tenantId: "tenant-a",
    action: "finding.disposition_updated",
    resourceType: "ai_finding",
    resourceId: "finding-a"
  };

  const eventOpen = createAuditEvent({ ...base, afterStateRef: { status: "open", note: "AAA" } });
  const eventClosed = createAuditEvent({ ...base, afterStateRef: { status: "open", note: "ZZZ" } });

  // Differing nested content must produce different hashes.
  assert.notEqual(eventOpen.eventHash, eventClosed.eventHash);

  // And an event carrying a nested state ref still round-trips through verification.
  const chained = createAuditEvent({
    ...base,
    afterStateRef: { status: "closed", reviewer: "user-a" },
    previousHash: eventOpen.eventHash
  });
  assert.equal(verifyAuditChain([eventOpen, chained]).valid, true);

  // Tampering the nested content is detected.
  const tampered = {
    ...chained,
    afterStateRef: { status: "closed", reviewer: "attacker" }
  };
  assert.equal(verifyAuditChain([eventOpen, tampered]).valid, false);
});

test("audit hashing is independent of input key order", () => {
  const forward = createAuditEvent({
    tenantId: "tenant-a",
    action: "project.created",
    resourceType: "project",
    resourceId: "project-a"
  });
  const reordered = createAuditEvent({
    resourceId: "project-a",
    resourceType: "project",
    action: "project.created",
    tenantId: "tenant-a",
    eventId: forward.eventId,
    correlationId: forward.correlationId,
    requestId: forward.requestId,
    timestamp: forward.timestamp
  });

  assert.equal(reordered.eventHash, forward.eventHash);
});
