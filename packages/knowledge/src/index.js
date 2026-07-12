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
