import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";
import { assertProjectAccess, assertSessionTenantAccess } from "../../auth/src/synthetic-auth.js";

const FIELD_ITEM_STATUS_SET = new Set([
  "open",
  "triaged",
  "in_progress",
  "resolved",
  "closed",
  "deferred"
]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

export function createFieldItem(input) {
  requiredString(input?.id, "Field item id");
  requiredString(input?.tenantId, "Field item tenantId");
  requiredString(input?.projectId, "Field item projectId");
  requiredString(input?.itemType, "Field item itemType");
  requiredString(input?.status, "Field item status");
  requiredString(input?.title, "Field item title");

  if (!FIELD_ITEM_STATUS_SET.has(input.status)) {
    throw new Error(`Unknown field item status: ${input.status}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    itemType: input.itemType,
    title: input.title,
    status: input.status,
    location: input.location ?? null,
    photoFixtureRefs: input.photoFixtureRefs ?? [],
    relatedSheetIds: input.relatedSheetIds ?? [],
    relatedModelIds: input.relatedModelIds ?? [],
    responsibleParty: input.responsibleParty ?? null,
    dueDate: input.dueDate ?? null,
    resolution: input.resolution ?? null,
    costImpactPlaceholder: input.costImpactPlaceholder ?? null,
    staged: true
  };
}

export function updateFieldItemStatus({ session, fieldItem, nextStatus, resolution = null }) {
  assertSessionTenantAccess(session, fieldItem.tenantId);
  assertProjectAccess(session, fieldItem.projectId);

  if (!FIELD_ITEM_STATUS_SET.has(nextStatus)) {
    throw new Error(`Unknown field item status: ${nextStatus}`);
  }

  if (nextStatus === "resolved" && !resolution) {
    throw new Error("Field item resolution is required before resolving.");
  }

  const updated = {
    ...fieldItem,
    status: nextStatus,
    resolution: resolution ?? fieldItem.resolution
  };

  return {
    fieldItem: updated,
    auditEvent: createAuditEvent({
      tenantId: fieldItem.tenantId,
      actorType: "user",
      actorId: session.userId,
      action: "construction.field_item.updated",
      resourceType: "field_item",
      resourceId: fieldItem.id,
      beforeStateRef: fieldItem.status,
      afterStateRef: nextStatus
    }),
    outboxEvent: createOutboxEvent({
      eventType: "construction.field_item.updated",
      aggregateType: "field_item",
      aggregateId: fieldItem.id,
      tenantId: fieldItem.tenantId,
      payload: {
        nextStatus
      }
    })
  };
}
