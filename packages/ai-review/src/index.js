import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";
import { assertProjectAccess, assertSessionTenantAccess } from "../../auth/src/synthetic-auth.js";

const REVIEW_STATUS_SET = new Set([
  "queued",
  "intake_validated",
  "classified",
  "evidence_assembled",
  "awaiting_human_review",
  "completed"
]);

const FINDING_CATEGORY_SET = new Set([
  "missing_dimensions",
  "missing_annotations",
  "missing_title_block_information",
  "inconsistent_scale_declarations",
  "unresolved_references",
  "missing_sheets",
  "incomplete_schedules",
  "duplicate_sheet_numbers",
  "revision_inconsistencies",
  "overlapping_geometry",
  "discipline_conflict",
  "clearance_concern",
  "missing_model_properties",
  "ids_requirement_failure",
  "potential_code_concern",
  "permit_package_completeness_concern",
  "insufficient_information"
]);

const HUMAN_DISPOSITION_SET = new Set([
  "pending",
  "accepted",
  "rejected_false_positive",
  "needs_more_information",
  "converted_to_issue"
]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

export function createReviewRun(input) {
  requiredString(input?.id, "Review run id");
  requiredString(input?.tenantId, "Review run tenantId");
  requiredString(input?.projectId, "Review run projectId");
  requiredString(input?.artifactType, "Review run artifactType");
  requiredString(input?.artifactId, "Review run artifactId");

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    artifactType: input.artifactType,
    artifactId: input.artifactId,
    status: input.status ?? "queued",
    ruleVersion: input.ruleVersion ?? "rules-v1",
    modelVersion: input.modelVersion ?? "model-sim-v1",
    jurisdictionProfile: input.jurisdictionProfile ?? null,
    staged: true
  };
}

export function classifyArtifact({ reviewRun, artifact }) {
  const artifactType =
    artifact.sheetNumber ? "drawing_sheet" : artifact.modelName ? "bim_model" : reviewRun.artifactType;

  return {
    ...reviewRun,
    artifactType,
    status: "classified"
  };
}

export function runDeterministicChecks({ reviewRun, artifact }) {
  const findings = [];

  if (artifact.sheetNumber && !artifact.sheetTitle) {
    findings.push({
      category: "missing_annotations",
      description: "Potential issue: drawing sheet title is missing."
    });
  }

  if (artifact.sheetNumber && artifact.aiReviewStatus === "pending") {
    findings.push({
      category: "permit_package_completeness_concern",
      description: "Potential issue: sheet has not completed staged AI review status."
    });
  }

  if (artifact.modelName && artifact.approvalState === "unapproved") {
    findings.push({
      category: "missing_model_properties",
      description: "Potential issue: model approval state remains unapproved."
    });
  }

  return findings.map((finding, index) => ({
    id: `${reviewRun.id}-rule-${index + 1}`,
    reviewRunId: reviewRun.id,
    ruleVersion: reviewRun.ruleVersion,
    category: finding.category,
    description: finding.description,
    deterministic: true,
    staged: true
  }));
}

export function createEvidenceRecord(input) {
  requiredString(input?.id, "Evidence id");
  requiredString(input?.reviewRunId, "Evidence reviewRunId");
  requiredString(input?.evidenceType, "Evidence evidenceType");
  requiredArray(input?.references ?? [], "Evidence references");

  return {
    id: input.id,
    reviewRunId: input.reviewRunId,
    evidenceType: input.evidenceType,
    references: input.references,
    excerpt: input.excerpt ?? null,
    staged: true
  };
}

export function createFinding(input) {
  requiredString(input?.id, "Finding id");
  requiredString(input?.reviewRunId, "Finding reviewRunId");
  requiredString(input?.category, "Finding category");
  requiredString(input?.title, "Finding title");
  requiredString(input?.description, "Finding description");
  requiredString(input?.severity, "Finding severity");

  if (!FINDING_CATEGORY_SET.has(input.category)) {
    throw new Error(`Unknown finding category: ${input.category}`);
  }

  if (!input.description.includes("Potential issue") && !input.description.includes("Requires qualified review")) {
    throw new Error("AI findings must use staged cautionary language.");
  }

  return {
    id: input.id,
    reviewRunId: input.reviewRunId,
    ruleOrModelVersion: input.ruleOrModelVersion ?? "hybrid-v1",
    category: input.category,
    title: input.title,
    description: input.description,
    severity: input.severity,
    confidence: input.confidence ?? "medium",
    evidenceType: input.evidenceType ?? "hybrid",
    evidenceReferences: input.evidenceReferences ?? [],
    referencedStandard: input.referencedStandard ?? null,
    jurisdictionProfile: input.jurisdictionProfile ?? null,
    assumptions: input.assumptions ?? [],
    missingInformation: input.missingInformation ?? [],
    suggestedNextAction: input.suggestedNextAction ?? "Requires qualified review",
    assignedDiscipline: input.assignedDiscipline ?? null,
    humanDisposition: input.humanDisposition ?? "pending",
    staged: true
  };
}

export function assembleFindingFromRule({ reviewRun, ruleResult, evidenceRecords }) {
  return createFinding({
    id: `${ruleResult.id}-finding`,
    reviewRunId: reviewRun.id,
    ruleOrModelVersion: ruleResult.ruleVersion,
    category: ruleResult.category,
    title: "Staged review finding",
    description: `${ruleResult.description} Requires qualified review.`,
    severity: "medium",
    evidenceType: "deterministic_rule",
    evidenceReferences: evidenceRecords.map((record) => record.id),
    assignedDiscipline: "architecture"
  });
}

export function setHumanDisposition({ session, finding, nextDisposition, relatedIssueId = null }) {
  if (!HUMAN_DISPOSITION_SET.has(nextDisposition)) {
    throw new Error(`Unknown human disposition: ${nextDisposition}`);
  }

  if (nextDisposition === "converted_to_issue" && !relatedIssueId) {
    throw new Error("Converted findings require a related issue id.");
  }

  return {
    ...finding,
    humanDisposition: nextDisposition,
    relatedIssueId
  };
}

export function evaluateReviewRun({ expected, actual }) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);

  const truePositives = actual.filter((item) => expectedSet.has(item)).length;
  const falsePositives = actual.filter((item) => !expectedSet.has(item)).length;
  const falseNegatives = expected.filter((item) => !actualSet.has(item)).length;

  return {
    precision: actual.length === 0 ? 0 : truePositives / actual.length,
    recall: expected.length === 0 ? 0 : truePositives / expected.length,
    falsePositiveRate: actual.length === 0 ? 0 : falsePositives / actual.length,
    falseNegatives
  };
}

export function emitAiReviewAudit({ session, reviewRun, finding, action }) {
  return {
    auditEvent: createAuditEvent({
      tenantId: reviewRun.tenantId,
      actorType: "user",
      actorId: session.userId,
      action,
      resourceType: "ai_finding",
      resourceId: finding.id
    }),
    outboxEvent: createOutboxEvent({
      eventType: action,
      aggregateType: "ai_finding",
      aggregateId: finding.id,
      tenantId: reviewRun.tenantId,
      payload: {
        reviewRunId: reviewRun.id
      }
    })
  };
}

export function runReviewIntake({ session, reviewRun, artifact }) {
  assertSessionTenantAccess(session, reviewRun.tenantId);
  assertProjectAccess(session, reviewRun.projectId);

  const validatedRun = {
    ...reviewRun,
    status: "intake_validated"
  };
  const classifiedRun = classifyArtifact({
    reviewRun: validatedRun,
    artifact
  });
  const ruleResults = runDeterministicChecks({
    reviewRun: classifiedRun,
    artifact
  });

  return {
    reviewRun: {
      ...classifiedRun,
      status: ruleResults.length > 0 ? "awaiting_human_review" : "completed"
    },
    ruleResults
  };
}
