import test from "node:test";
import assert from "node:assert/strict";

import { createSyntheticSession } from "../../auth/src/synthetic-auth.js";
import {
  assembleFindingFromRule,
  createEvidenceRecord,
  createFinding,
  createReviewRun,
  emitAiReviewAudit,
  evaluateReviewRun,
  runReviewIntake,
  setHumanDisposition
} from "../src/index.js";

test("AI findings reject unknown categories", () => {
  assert.throws(
    () =>
      createFinding({
        id: "finding-a",
        reviewRunId: "run-a",
        category: "perfect_building",
        title: "Bad",
        description: "Potential issue: unsupported.",
        severity: "medium"
      }),
    /Unknown finding category/
  );
});

test("AI findings require cautionary staged language", () => {
  assert.throws(
    () =>
      createFinding({
        id: "finding-a",
        reviewRunId: "run-a",
        category: "missing_dimensions",
        title: "Bad",
        description: "Code compliant.",
        severity: "medium"
      }),
    /cautionary language/
  );
});

test("review intake classifies artifact and produces deterministic rule results", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const reviewRun = createReviewRun({
    id: "run-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    artifactType: "drawing_sheet",
    artifactId: "sheet-a"
  });
  const result = runReviewIntake({
    session,
    reviewRun,
    artifact: {
      sheetNumber: "A101",
      sheetTitle: "Plan",
      aiReviewStatus: "pending"
    }
  });

  assert.equal(result.reviewRun.status, "awaiting_human_review");
  assert.ok(result.ruleResults.length > 0);
});

test("assembled findings retain evidence references", () => {
  const evidence = createEvidenceRecord({
    id: "evidence-a",
    reviewRunId: "run-a",
    evidenceType: "drawing_metadata",
    references: ["sheet:A101"]
  });
  const finding = assembleFindingFromRule({
    reviewRun: createReviewRun({
      id: "run-a",
      tenantId: "tenant-a",
      projectId: "project-a",
      artifactType: "drawing_sheet",
      artifactId: "sheet-a"
    }),
    ruleResult: {
      id: "rule-a",
      reviewRunId: "run-a",
      ruleVersion: "rules-v1",
      category: "missing_dimensions",
      description: "Potential issue: dimensions appear incomplete."
    },
    evidenceRecords: [evidence]
  });

  assert.equal(finding.evidenceReferences[0], "evidence-a");
});

test("human disposition requires related issue id when converting", () => {
  const finding = createFinding({
    id: "finding-a",
    reviewRunId: "run-a",
    category: "discipline_conflict",
    title: "Coordination",
    description: "Potential issue: clash detected. Requires qualified review.",
    severity: "high"
  });

  assert.throws(
    () =>
      setHumanDisposition({
        session: null,
        finding,
        nextDisposition: "converted_to_issue"
      }),
    /related issue id/
  );
});

test("evaluation helper reports precision and recall", () => {
  const metrics = evaluateReviewRun({
    expected: ["missing_dimensions", "duplicate_sheet_numbers"],
    actual: ["missing_dimensions", "overlapping_geometry"]
  });

  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.recall, 0.5);
});

test("AI audit emits audit and outbox events", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const reviewRun = createReviewRun({
    id: "run-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    artifactType: "drawing_sheet",
    artifactId: "sheet-a"
  });
  const finding = createFinding({
    id: "finding-a",
    reviewRunId: "run-a",
    category: "missing_dimensions",
    title: "Dimensions",
    description: "Potential issue: dimensions appear incomplete. Requires qualified review.",
    severity: "medium"
  });
  const result = emitAiReviewAudit({
    session,
    reviewRun,
    finding,
    action: "ai.finding.created"
  });

  assert.equal(result.auditEvent.action, "ai.finding.created");
  assert.equal(result.outboxEvent.eventType, "ai.finding.created");
});
