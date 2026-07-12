import test from "node:test";
import assert from "node:assert/strict";

import { createSyntheticSession } from "../../auth/src/synthetic-auth.js";
import { createFieldItem, updateFieldItemStatus } from "../src/index.js";

test("field items reject unknown statuses", () => {
  assert.throws(
    () =>
      createFieldItem({
        id: "field-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        itemType: "site_issue",
        status: "wild",
        title: "Issue"
      }),
    /Unknown field item status/
  );
});

test("field items require resolution before closing", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const fieldItem = createFieldItem({
    id: "field-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    itemType: "site_issue",
    status: "in_progress",
    title: "Issue"
  });

  assert.throws(
    () =>
      updateFieldItemStatus({
        session,
        fieldItem,
        nextStatus: "resolved"
      }),
    /resolution is required/
  );
});

test("field item updates emit audit and outbox events", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const fieldItem = createFieldItem({
    id: "field-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    itemType: "observation",
    status: "in_progress",
    title: "Observation"
  });
  const result = updateFieldItemStatus({
    session,
    fieldItem,
    nextStatus: "resolved",
    resolution: "Corrected in staged fixture"
  });

  assert.equal(result.fieldItem.status, "resolved");
  assert.equal(result.auditEvent.action, "construction.field_item.updated");
});
