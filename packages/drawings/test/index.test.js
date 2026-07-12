import test from "node:test";
import assert from "node:assert/strict";

import { assertUniqueSheetRevision, buildSheetIndex, createDrawingSheet } from "../src/index.js";

test("drawing sheets reject unsupported source formats", () => {
  assert.throws(
    () =>
      createDrawingSheet({
        id: "sheet-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        fileId: "file-a",
        discipline: "architecture",
        sheetNumber: "A101",
        sheetTitle: "Plan",
        sourceFormat: "rvt"
      }),
    /Unsupported drawing source format/
  );
});

test("drawing sheet collision detection protects number and revision uniqueness", () => {
  const sheet = createDrawingSheet({
    id: "sheet-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    fileId: "file-a",
    discipline: "architecture",
    sheetNumber: "A101",
    sheetTitle: "Plan",
    sourceFormat: "pdf"
  });

  assert.throws(() => assertUniqueSheetRevision([sheet], sheet), /collision/);
});

test("sheet index summarizes drawing registry entries", () => {
  const sheet = createDrawingSheet({
    id: "sheet-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    fileId: "file-a",
    discipline: "architecture",
    sheetNumber: "A101",
    sheetTitle: "Plan",
    sourceFormat: "pdf"
  });
  const index = buildSheetIndex([sheet]);

  assert.equal(index[0].sheetNumber, "A101");
});
