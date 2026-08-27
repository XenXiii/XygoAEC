function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

const VISIBILITY_CLASS_SET = new Set([
  "private",
  "participant_only",
  "team_only",
  "department_only",
  "project_only",
  "discipline_restricted",
  "restricted_control",
  "finance_restricted",
  "legal_restricted",
  "executive_oversight",
  "company_public_summary"
]);

const CODING_SYSTEM_SET = new Set([
  "ICD-10-CM",
  "ICD-10-PCS",
  "CPT",
  "HCPCS-II",
  "NCCI",
  "NCD",
  "LCD",
  "CMS-GUIDANCE",
  "OIG-GUIDANCE"
]);

const CODE_PATTERN_BY_SYSTEM = {
  "ICD-10-CM": /^[A-TV-Z][0-9][0-9AB](?:\.[A-Z0-9]{1,4})?$/i,
  "ICD-10-PCS": /^[0-9A-HJ-NP-Z]{7}$/i,
  CPT: /^[0-9]{5}(?:F|T)?$/i,
  "HCPCS-II": /^[A-Z][0-9]{4}$/i
};

export function createKnowledgeSource(input) {
  requiredString(input?.id, "Knowledge source id");
  requiredString(input?.tenantId, "Knowledge source tenantId");
  requiredString(input?.projectId, "Knowledge source projectId");
  requiredString(input?.sourceType, "Knowledge source sourceType");
  requiredString(input?.title, "Knowledge source title");
  requiredString(input?.visibilityClass, "Knowledge source visibilityClass");

  if (!VISIBILITY_CLASS_SET.has(input.visibilityClass)) {
    throw new Error(`Unknown visibility class: ${input.visibilityClass}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    sourceType: input.sourceType,
    title: input.title,
    visibilityClass: input.visibilityClass,
    effectiveDate: input.effectiveDate ?? null,
    chunkRefs: input.chunkRefs ?? [],
    staged: true
  };
}

export function createRetrievedSource(input) {
  requiredString(input?.knowledgeSourceId, "Retrieved source knowledgeSourceId");
  requiredString(input?.chunkId, "Retrieved source chunkId");
  requiredString(input?.excerpt, "Retrieved source excerpt");

  return {
    knowledgeSourceId: input.knowledgeSourceId,
    chunkId: input.chunkId,
    excerpt: input.excerpt,
    effectiveDate: input.effectiveDate ?? null,
    staged: true
  };
}

export function filterKnowledgeSources({ tenantId, projectId, visibilityClasses, sources }) {
  return sources.filter(
    (source) =>
      source.tenantId === tenantId &&
      source.projectId === projectId &&
      visibilityClasses.includes(source.visibilityClass)
  );
}

export function normalizeMedicalCode(system, code) {
  requiredString(system, "Coding system");
  requiredString(code, "Medical code");
  if (!CODING_SYSTEM_SET.has(system)) {
    throw new Error(`Unknown coding system: ${system}`);
  }
  const normalized = code.trim().toUpperCase();
  const pattern = CODE_PATTERN_BY_SYSTEM[system];
  if (pattern && !pattern.test(normalized)) {
    throw new Error(`Invalid ${system} code format: ${code}`);
  }
  return normalized;
}

export function createCodingSource(input) {
  requiredString(input?.id, "Coding source id");
  requiredString(input?.system, "Coding source system");
  requiredString(input?.title, "Coding source title");
  requiredString(input?.authority, "Coding source authority");
  requiredString(input?.url, "Coding source url");
  requiredString(input?.effectiveDate, "Coding source effectiveDate");

  if (!CODING_SYSTEM_SET.has(input.system)) {
    throw new Error(`Unknown coding system: ${input.system}`);
  }

  if (input.system === "CPT" && input.license !== "licensed_ama_source") {
    throw new Error("CPT ingestion requires a licensed AMA source. Do not ingest unlicensed CPT descriptors.");
  }

  return {
    id: input.id,
    system: input.system,
    title: input.title,
    authority: input.authority,
    url: input.url,
    effectiveDate: input.effectiveDate,
    version: input.version ?? null,
    license: input.license ?? "public",
    retrievedAt: input.retrievedAt ?? null,
    hash: input.hash ?? null,
    staged: true
  };
}

export function createCodingRule(input) {
  requiredString(input?.id, "Coding rule id");
  requiredString(input?.system, "Coding rule system");
  requiredString(input?.ruleType, "Coding rule ruleType");
  requiredString(input?.summary, "Coding rule summary");
  requiredString(input?.sourceId, "Coding rule sourceId");

  if (!CODING_SYSTEM_SET.has(input.system)) {
    throw new Error(`Unknown coding system: ${input.system}`);
  }

  return {
    id: input.id,
    system: input.system,
    ruleType: input.ruleType,
    code: input.code ? normalizeMedicalCode(input.system, input.code) : null,
    summary: input.summary,
    conditions: input.conditions ?? [],
    sourceId: input.sourceId,
    sourceLocator: input.sourceLocator ?? null,
    severity: input.severity ?? "informational",
    effectiveDate: input.effectiveDate ?? null,
    staged: true
  };
}

export function createCrosswalkRule(input) {
  requiredString(input?.id, "Crosswalk rule id");
  requiredString(input?.fromSystem, "Crosswalk rule fromSystem");
  requiredString(input?.toSystem, "Crosswalk rule toSystem");
  requiredString(input?.relationship, "Crosswalk rule relationship");
  requiredString(input?.sourceId, "Crosswalk rule sourceId");

  return {
    id: input.id,
    fromSystem: input.fromSystem,
    fromCode: normalizeMedicalCode(input.fromSystem, input.fromCode),
    toSystem: input.toSystem,
    toCode: normalizeMedicalCode(input.toSystem, input.toCode),
    relationship: input.relationship,
    medicalNecessityRequired: Boolean(input.medicalNecessityRequired),
    documentationRequired: input.documentationRequired ?? [],
    sourceId: input.sourceId,
    sourceLocator: input.sourceLocator ?? null,
    effectiveDate: input.effectiveDate ?? null,
    staged: true
  };
}

export function evaluateCodingRecommendation({ recommendation, chartEvidence = [], rules = [], crosswalks = [] }) {
  const codes = (recommendation?.codes ?? []).map((entry) => ({
    system: entry.system,
    code: normalizeMedicalCode(entry.system, entry.code),
    rationale: entry.rationale ?? "",
    evidenceRefs: entry.evidenceRefs ?? [],
    sourceRefs: entry.sourceRefs ?? []
  }));

  const evidenceIds = new Set(chartEvidence.map((item) => item.id));
  const findings = [];

  for (const code of codes) {
    if (code.evidenceRefs.length === 0 || code.evidenceRefs.some((ref) => !evidenceIds.has(ref))) {
      findings.push({
        severity: "critical",
        code: code.code,
        system: code.system,
        issue: "INSUFFICIENT_DOCUMENTATION",
        required: "Every code must cite documented chart evidence."
      });
    }
    if (code.sourceRefs.length === 0) {
      findings.push({
        severity: "critical",
        code: code.code,
        system: code.system,
        issue: "MISSING_AUTHORITATIVE_REFERENCE",
        required: "Every code must cite a coding source, guideline, instruction, policy, or edit."
      });
    }
  }

  for (const rule of rules) {
    if (rule.code && codes.some((code) => code.system === rule.system && code.code === rule.code)) {
      findings.push({
        severity: rule.severity,
        code: rule.code,
        system: rule.system,
        issue: rule.ruleType,
        required: rule.summary,
        sourceId: rule.sourceId,
        sourceLocator: rule.sourceLocator
      });
    }
  }

  for (const crosswalk of crosswalks) {
    const fromPresent = codes.some((code) => code.system === crosswalk.fromSystem && code.code === crosswalk.fromCode);
    const toPresent = codes.some((code) => code.system === crosswalk.toSystem && code.code === crosswalk.toCode);
    if (fromPresent && !toPresent && crosswalk.relationship === "requires_supporting_code") {
      findings.push({
        severity: "high",
        code: crosswalk.fromCode,
        system: crosswalk.fromSystem,
        issue: "MISSING_CODE_SUPPORT",
        required: `${crosswalk.toSystem} ${crosswalk.toCode} is required or must be ruled out.`,
        sourceId: crosswalk.sourceId,
        sourceLocator: crosswalk.sourceLocator
      });
    }
  }

  return {
    codes,
    findings,
    confidenceScore: findings.some((item) => item.severity === "critical")
      ? 0
      : Math.max(0.1, 1 - findings.length * 0.15),
    auditTrail: {
      evaluatedAt: new Date().toISOString(),
      evidenceCount: chartEvidence.length,
      ruleCount: rules.length,
      crosswalkCount: crosswalks.length
    },
    staged: true
  };
}
