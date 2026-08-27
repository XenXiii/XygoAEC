import test from "node:test";
import assert from "node:assert/strict";
import { auditTiles, loadingAuditTiles, unavailableAuditTiles } from "../public/audit-results-view.js";

test("loading and failure states contain no fixture numbers", () => {
  assert.deepEqual(Object.values(loadingAuditTiles()).slice(0, 5), ["—", "—", "—", "—", "—"]);
  assert.deepEqual(Object.values(unavailableAuditTiles()).slice(0, 5), ["—", "—", "—", "—", "—"]);
});

test("server result renders explicit unknown revenue", () => {
  const tiles = auditTiles({ businessHealth: { score: null }, opportunityCount: 2, potentialAnnualRevenue: { amount: null, kind: "unknown", note: "No verified revenue inputs are connected." }, operationalIssueCount: 3, recommendedAutomation: null });
  assert.equal(tiles.health, "—");
  assert.equal(tiles.opportunities, "2");
  assert.equal(tiles.revenue, "—");
  assert.equal(tiles.issues, "3");
  assert.equal(tiles.automation, "0");
  assert.match(tiles.note, /No verified revenue/);
});
