import test from "node:test";
import assert from "node:assert/strict";

import {
  createCodingRule,
  createCodingSource,
  createCrosswalkRule,
  createKnowledgeSource,
  createRetrievedSource,
  evaluateCodingRecommendation,
  filterKnowledgeSources,
  normalizeMedicalCode
} from "../src/index.js";

test("knowledge sources reject unknown visibility classes", () => {
  assert.throws(
    () =>
      createKnowledgeSource({
        id: "source-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        sourceType: "project_spec",
        title: "Spec",
        visibilityClass: "cosmic"
      }),
    /Unknown visibility class/
  );
});

test("retrieval filters remain tenant and project scoped", () => {
  const sources = [
    createKnowledgeSource({
      id: "source-a",
      tenantId: "tenant-a",
      projectId: "project-a",
      sourceType: "project_spec",
      title: "Spec A",
      visibilityClass: "project_only"
    }),
    createKnowledgeSource({
      id: "source-b",
      tenantId: "tenant-b",
      projectId: "project-b",
      sourceType: "project_spec",
      title: "Spec B",
      visibilityClass: "project_only"
    })
  ];

  const filtered = filterKnowledgeSources({
    tenantId: "tenant-a",
    projectId: "project-a",
    visibilityClasses: ["project_only"],
    sources
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, "source-a");
});

test("retrieved sources preserve chunk provenance", () => {
  const source = createRetrievedSource({
    knowledgeSourceId: "source-a",
    chunkId: "chunk-1",
    excerpt: "Synthetic excerpt"
  });

  assert.equal(source.chunkId, "chunk-1");
});

test("medical code normalization validates system formats", () => {
  assert.equal(normalizeMedicalCode("ICD-10-CM", "e11.9"), "E11.9");
  assert.equal(normalizeMedicalCode("ICD-10-PCS", "0ft44zz"), "0FT44ZZ");
  assert.equal(normalizeMedicalCode("CPT", "99213"), "99213");
  assert.equal(normalizeMedicalCode("HCPCS-II", "a0428"), "A0428");
  assert.throws(() => normalizeMedicalCode("CPT", "ABCDE"), /Invalid CPT/);
});

test("CPT sources require a licensed AMA source marker", () => {
  assert.throws(
    () => createCodingSource({
      id: "cpt-2022",
      system: "CPT",
      title: "CPT 2022",
      authority: "AMA",
      url: "licensed://ama/cpt-2022",
      effectiveDate: "2022-01-01"
    }),
    /licensed AMA source/
  );

  const source = createCodingSource({
    id: "cpt-2022",
    system: "CPT",
    title: "CPT 2022",
    authority: "AMA",
    url: "licensed://ama/cpt-2022",
    effectiveDate: "2022-01-01",
    license: "licensed_ama_source"
  });

  assert.equal(source.license, "licensed_ama_source");
});

test("coding recommendation evaluation requires evidence and references", () => {
  const result = evaluateCodingRecommendation({
    recommendation: {
      codes: [
        { system: "ICD-10-CM", code: "E11.9", evidenceRefs: ["assessment-1"], sourceRefs: ["icd10cm-guidelines"] },
        { system: "CPT", code: "99213", evidenceRefs: [], sourceRefs: [] }
      ]
    },
    chartEvidence: [{ id: "assessment-1", text: "Type 2 diabetes mellitus documented." }]
  });

  assert.equal(result.codes.length, 2);
  assert.ok(result.findings.some((finding) => finding.issue === "INSUFFICIENT_DOCUMENTATION"));
  assert.ok(result.findings.some((finding) => finding.issue === "MISSING_AUTHORITATIVE_REFERENCE"));
  assert.equal(result.confidenceScore, 0);
});

test("crosswalk rules flag missing supporting codes", () => {
  const source = createCodingSource({
    id: "cms-ncci-2026",
    system: "NCCI",
    title: "NCCI Medicare Policy Manual 2026",
    authority: "CMS",
    url: "https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits",
    effectiveDate: "2026-01-01"
  });
  const rule = createCodingRule({
    id: "laterality-required",
    system: "ICD-10-CM",
    ruleType: "laterality_review",
    code: "M25.50",
    summary: "Review documentation for specific joint and laterality where required.",
    sourceId: "icd10cm-guidelines",
    severity: "medium"
  });
  const crosswalk = createCrosswalkRule({
    id: "diagnosis-support-required",
    fromSystem: "CPT",
    fromCode: "99213",
    toSystem: "ICD-10-CM",
    toCode: "E11.9",
    relationship: "requires_supporting_code",
    sourceId: source.id
  });

  const result = evaluateCodingRecommendation({
    recommendation: {
      codes: [{ system: "CPT", code: "99213", evidenceRefs: ["note-1"], sourceRefs: [source.id] }]
    },
    chartEvidence: [{ id: "note-1", text: "Established patient visit documented." }],
    rules: [rule],
    crosswalks: [crosswalk]
  });

  assert.ok(result.findings.some((finding) => finding.issue === "MISSING_CODE_SUPPORT"));
});
