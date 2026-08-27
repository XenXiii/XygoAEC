import test from "node:test";
import assert from "node:assert/strict";
import { synthesizeTenantAuditResult } from "../src/index.js";

test("weak tenant evidence produces explicit unknown health and revenue", () => {
  const result = synthesizeTenantAuditResult({ tenantId: "tenant-a", projects: [{ id: "p" }] });
  assert.equal(result.businessHealth.score, null);
  assert.equal(result.businessHealth.kind, "unknown");
  assert.equal(result.potentialAnnualRevenue.amount, null);
  assert.equal(result.potentialAnnualRevenue.kind, "unknown");
  assert.deepEqual(result.classification.projections, []);
});

test("sufficient evidenced operational signals produce a bounded health inference", () => {
  const result = synthesizeTenantAuditResult({
    tenantId: "tenant-a",
    projects: [{ id: "p" }],
    issues: [{ id: "i", title: "Open issue", status: "open" }],
    findings: [
      { id: "f1", title: "Finding 1", humanDisposition: "pending", evidenceReferences: ["e1"] },
      { id: "f2", title: "Finding 2", humanDisposition: "pending", evidenceReferences: ["e2"] }
    ],
    permits: [{ id: "permit", status: "ready" }]
  });
  assert.equal(result.businessHealth.kind, "inference");
  assert.equal(typeof result.businessHealth.score, "number");
  assert.ok(result.businessHealth.score >= 0 && result.businessHealth.score <= 100);
  assert.equal(result.potentialAnnualRevenue.kind, "unknown");
  assert.ok(result.opportunityCount >= 2);
  assert.ok(result.classification.inferences.some((item) => item.type === "business_health"));
});

test("tenant id is required", () => {
  assert.throws(() => synthesizeTenantAuditResult({}), { status: 400 });
});
