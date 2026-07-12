import test from "node:test";
import assert from "node:assert/strict";

import { createKnowledgeSource, createRetrievedSource, filterKnowledgeSources } from "../src/index.js";

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
