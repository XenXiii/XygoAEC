import test from "node:test";
import assert from "node:assert/strict";

import { createSyntheticSession } from "../../auth/src/synthetic-auth.js";
import {
  createApprovalRequest,
  createBCFTopic,
  createCoordinationIssue,
  createRfi,
  emitCoordinationAudit,
  updateApprovalStatus
} from "../src/index.js";

test("coordination issues reject unknown statuses", () => {
  assert.throws(
    () =>
      createCoordinationIssue({
        id: "issue-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        title: "Issue",
        description: "Desc",
        status: "flying",
        disciplines: ["architecture"]
      }),
    /Unknown coordination issue status/
  );
});

test("coordination issues preserve evidence and discipline links", () => {
  const issue = createCoordinationIssue({
    id: "issue-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    title: "Beam clash",
    description: "Plumbing conflicts with beam",
    status: "open",
    disciplines: ["plumbing", "structural"],
    evidence: ["model:model-a", "sheet:A101"]
  });

  assert.equal(issue.disciplines.length, 2);
  assert.equal(issue.evidence[0], "model:model-a");
});

test("BCF topics retain issue-linked staged viewpoints", () => {
  const topic = createBCFTopic({
    id: "bcf-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    issueId: "issue-a",
    topic: "Clash viewpoint"
  });

  assert.equal(topic.issueId, "issue-a");
});

test("RFIs reject unknown states", () => {
  assert.throws(
    () =>
      createRfi({
        id: "rfi-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        title: "Question",
        status: "void"
      }),
    /Unknown RFI status/
  );
});

test("approval updates require tenant and project scope", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const request = createApprovalRequest({
    id: "approval-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    approvalType: "discipline_release",
    status: "pending"
  });
  const updated = updateApprovalStatus({
    session,
    approvalRequest: request,
    nextStatus: "approved"
  });

  assert.equal(updated.status, "approved");
});

test("coordination audit emits audit and outbox events", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const issue = createCoordinationIssue({
    id: "issue-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    title: "Issue",
    description: "Desc",
    status: "open",
    disciplines: ["architecture"]
  });
  const result = emitCoordinationAudit({
    session,
    resource: {
      ...issue,
      resourceType: "coordination_issue"
    },
    action: "coordination.issue.created",
    payload: {
      projectId: "project-a"
    }
  });

  assert.equal(result.auditEvent.action, "coordination.issue.created");
  assert.equal(result.outboxEvent.eventType, "coordination.issue.created");
});
