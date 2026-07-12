const SOURCE_FORMAT_SET = new Set(["pdf", "dwg", "dxf"]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

export function createDrawingSheet(input) {
  requiredString(input?.id, "Drawing sheet id");
  requiredString(input?.tenantId, "Drawing sheet tenantId");
  requiredString(input?.projectId, "Drawing sheet projectId");
  requiredString(input?.fileId, "Drawing sheet fileId");
  requiredString(input?.discipline, "Drawing sheet discipline");
  requiredString(input?.sheetNumber, "Drawing sheet sheetNumber");
  requiredString(input?.sheetTitle, "Drawing sheet sheetTitle");
  requiredString(input?.sourceFormat, "Drawing sheet sourceFormat");

  if (!SOURCE_FORMAT_SET.has(input.sourceFormat)) {
    throw new Error(`Unsupported drawing source format: ${input.sourceFormat}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    fileId: input.fileId,
    discipline: input.discipline,
    sheetNumber: input.sheetNumber,
    sheetTitle: input.sheetTitle,
    revision: input.revision ?? "A",
    sourceFormat: input.sourceFormat,
    lifecycleStatus: input.lifecycleStatus ?? "draft",
    aiReviewStatus: input.aiReviewStatus ?? "pending",
    integrityHash: input.integrityHash ?? `${input.fileId}:${input.sheetNumber}:${input.revision ?? "A"}`,
    staged: true
  };
}

export function assertUniqueSheetRevision(existingSheets, candidateSheet) {
  const duplicate = existingSheets.find(
    (sheet) =>
      sheet.projectId === candidateSheet.projectId &&
      sheet.sheetNumber === candidateSheet.sheetNumber &&
      sheet.revision === candidateSheet.revision
  );

  if (duplicate) {
    throw new Error("Drawing sheet collision: sheet number and revision already exist.");
  }
}

export function buildSheetIndex(sheets) {
  return sheets.map((sheet) => ({
    sheetId: sheet.id,
    sheetNumber: sheet.sheetNumber,
    title: sheet.sheetTitle,
    revision: sheet.revision,
    discipline: sheet.discipline
  }));
}
