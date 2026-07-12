import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrowserDerivative,
  createModelElementReference,
  createModelRecord
} from "../src/index.js";

test("model records reject unsupported source formats", () => {
  assert.throws(
    () =>
      createModelRecord({
        id: "model-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        sourceFileId: "file-a",
        discipline: "architecture",
        modelName: "A",
        sourceFormat: "fbx"
      }),
    /Unsupported model source format/
  );
});

test("model records preserve source and approval metadata", () => {
  const model = createModelRecord({
    id: "model-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    sourceFileId: "file-a",
    discipline: "architecture",
    modelName: "A",
    sourceFormat: "ifc"
  });

  assert.equal(model.sourceFormat, "ifc");
  assert.equal(model.approvalState, "unapproved");
});

test("browser derivatives stay explicit about equivalence validation", () => {
  const derivative = createBrowserDerivative({
    id: "derivative-a",
    modelId: "model-a",
    format: "glb"
  });

  assert.equal(derivative.geometricallyEquivalent, false);
  assert.equal(derivative.validationStatus, "unverified");
});

test("model element references retain metadata lookup context", () => {
  const ref = createModelElementReference({
    id: "ref-a",
    tenantId: "tenant-a",
    modelId: "model-a",
    elementId: "elem-1",
    propertySummary: {
      category: "Wall"
    }
  });

  assert.equal(ref.propertySummary.category, "Wall");
});
