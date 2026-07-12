import crypto from "node:crypto";

// Produce a canonical, order-independent JSON string. The array-replacer form of
// JSON.stringify only applies its key allowlist at the top level, so nested object
// content was silently dropped from the hash (a tamper-evidence hole for any
// object-valued state ref). Canonicalize recursively instead: sort keys at every
// depth, preserve array order. For flat scalar events this yields byte-identical
// output to the previous implementation, so existing chains stay valid.
function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        accumulator[key] = canonicalize(value[key]);
        return accumulator;
      }, {});
  }

  return value;
}

function stableSerialize(value) {
  return JSON.stringify(canonicalize(value));
}

export function createAuditEvent(input) {
  if (!input?.tenantId || !input?.action || !input?.resourceType || !input?.resourceId) {
    throw new Error("Audit events require tenantId, action, resourceType, and resourceId.");
  }

  const baseEvent = {
    eventId: input.eventId ?? crypto.randomUUID(),
    tenantId: input.tenantId,
    actorType: input.actorType ?? "system",
    actorId: input.actorId ?? "unknown",
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    beforeStateRef: input.beforeStateRef ?? null,
    afterStateRef: input.afterStateRef ?? null,
    correlationId: input.correlationId ?? crypto.randomUUID(),
    requestId: input.requestId ?? crypto.randomUUID(),
    schemaVersion: 1,
    staged: true,
    timestamp: input.timestamp ?? new Date().toISOString()
  };

  const previousHash = input.previousHash ?? null;
  const eventHash = crypto
    .createHash("sha256")
    .update(stableSerialize({ ...baseEvent, previousHash }))
    .digest("hex");

  return {
    ...baseEvent,
    previousHash,
    eventHash
  };
}

export function verifyAuditChain(events) {
  let previousHash = null;

  for (const event of events) {
    const recalculated = createAuditEvent({
      ...event,
      previousHash,
      eventId: event.eventId,
      correlationId: event.correlationId,
      requestId: event.requestId,
      timestamp: event.timestamp
    });

    if (recalculated.eventHash !== event.eventHash) {
      return {
        valid: false,
        reason: "hash_mismatch",
        eventId: event.eventId
      };
    }

    previousHash = event.eventHash;
  }

  return {
    valid: true
  };
}

export function createOutboxEvent(input) {
  if (!input?.eventType || !input?.aggregateType || !input?.aggregateId) {
    throw new Error("Outbox events require eventType, aggregateType, and aggregateId.");
  }

  return {
    id: input.id ?? crypto.randomUUID(),
    eventType: input.eventType,
    eventVersion: input.eventVersion ?? 1,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    tenantId: input.tenantId ?? null,
    payload: input.payload ?? {},
    staged: true,
    status: "pending",
    occurredAt: input.occurredAt ?? new Date().toISOString()
  };
}

export function buildAuditVerificationReport(events) {
  const result = verifyAuditChain(events);
  return {
    valid: result.valid,
    reason: result.reason ?? null,
    eventId: result.eventId ?? null,
    checkedEventCount: events.length,
    staged: true
  };
}
