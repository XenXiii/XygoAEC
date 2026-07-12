const MODEL_FORMAT_SET = new Set(["rvt", "ifc", "3dm", "obj", "glb", "stl"]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

export function createModelRecord(input) {
  requiredString(input?.id, "Model id");
  requiredString(input?.tenantId, "Model tenantId");
  requiredString(input?.projectId, "Model projectId");
  requiredString(input?.sourceFileId, "Model sourceFileId");
  requiredString(input?.discipline, "Model discipline");
  requiredString(input?.modelName, "Model modelName");
  requiredString(input?.sourceFormat, "Model sourceFormat");

  if (!MODEL_FORMAT_SET.has(input.sourceFormat)) {
    throw new Error(`Unsupported model source format: ${input.sourceFormat}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    sourceFileId: input.sourceFileId,
    discipline: input.discipline,
    modelName: input.modelName,
    sourceFormat: input.sourceFormat,
    authoringApplication: input.authoringApplication ?? "declared_unknown",
    lifecycleStatus: input.lifecycleStatus ?? "draft",
    reviewState: input.reviewState ?? "pending",
    approvalState: input.approvalState ?? "unapproved",
    derivativeArtifacts: input.derivativeArtifacts ?? [],
    integrityHash: input.integrityHash ?? `${input.sourceFileId}:${input.modelName}`,
    staged: true
  };
}

export function createModelElementReference(input) {
  requiredString(input?.id, "Model element reference id");
  requiredString(input?.tenantId, "Model element reference tenantId");
  requiredString(input?.modelId, "Model element reference modelId");
  requiredString(input?.elementId, "Model element reference elementId");

  return {
    id: input.id,
    tenantId: input.tenantId,
    modelId: input.modelId,
    elementId: input.elementId,
    propertySummary: input.propertySummary ?? {},
    staged: true
  };
}

export function createBrowserDerivative(input) {
  requiredString(input?.id, "Browser derivative id");
  requiredString(input?.modelId, "Browser derivative modelId");
  requiredString(input?.format, "Browser derivative format");

  if (!["glb", "thumbnail", "ifc_metadata"].includes(input.format)) {
    throw new Error(`Unsupported derivative format: ${input.format}`);
  }

  return {
    id: input.id,
    modelId: input.modelId,
    format: input.format,
    geometricallyEquivalent: input.geometricallyEquivalent ?? false,
    validationStatus: input.validationStatus ?? "unverified",
    staged: true
  };
}
