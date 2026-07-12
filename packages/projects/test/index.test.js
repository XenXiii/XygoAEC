import test from "node:test";
import assert from "node:assert/strict";

import { createSyntheticSession } from "../../auth/src/synthetic-auth.js";
import {
  createDisciplinePackage,
  createReviewComment,
  createReviewSession,
  transitionLifecycle
} from "../src/index.js";

test("discipline packages reject unknown disciplines", () => {
  assert.throws(
    () =>
      createDisciplinePackage({
        id: "pkg-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        discipline: "wizardry",
        leadUserId: "user-a",
        memberUserIds: [],
        staged: true
      }),
    /Unknown discipline/
  );
});

test("discipline packages create staged AEC scope records", () => {
  const pkg = createDisciplinePackage({
    id: "pkg-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    discipline: "architecture",
    leadUserId: "user-a",
    memberUserIds: ["user-b"],
    staged: true
  });

  assert.equal(pkg.discipline, "architecture");
  assert.equal(pkg.staged, true);
});

test("review sessions and comments keep project review linkage", () => {
  const session = createReviewSession({
    id: "review-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    createdBy: "user-a",
    artifactRefs: ["drawing:sheet-a"],
    staged: true
  });
  const comment = createReviewComment({
    id: "comment-a",
    tenantId: "tenant-a",
    reviewSessionId: session.id,
    authorUserId: "user-a",
    body: "Coordinate this opening."
  });

  assert.equal(comment.reviewSessionId, session.id);
});

test("lifecycle transitions require allowed sequence and project scope", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const result = transitionLifecycle({
    session,
    project: {
      id: "project-a",
      tenantId: "tenant-a",
      status: "draft"
    },
    fromState: "draft",
    toState: "internal_review"
  });

  assert.equal(result.project.status, "internal_review");
  assert.equal(result.auditEvent.action, "project.lifecycle.transitioned");
});

test("lifecycle transition blocks permit approval without artifacts", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });

  assert.throws(
    () =>
      transitionLifecycle({
        session,
        project: {
          id: "project-a",
          tenantId: "tenant-a",
          status: "coordination_review"
        },
        fromState: "coordination_review",
        toState: "approved_for_permit"
      }),
    /required artifacts missing/
  );
});
