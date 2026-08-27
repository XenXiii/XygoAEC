import test from "node:test";
import assert from "node:assert/strict";
import { auditTiles, unavailableTiles, loadingTiles, resolveCollections, formatMoney, PREVIEW_AUDIT_RESULT } from "../public/audit-results-view.js";

const FIXTURE_NUMBERS = new Set(["78", "3", "$42K", "2", "1"]);
const tileValues = (t) => [t.health, t.opportunities, t.revenue, t.issues, t.automation];

test("(a) the authenticated loading state contains no fixture numbers", () => {
  const t = loadingTiles();
  for (const value of tileValues(t)) assert.ok(!FIXTURE_NUMBERS.has(value), `loading value ${value} must not be a fixture number`);
  assert.deepEqual(tileValues(t), ["—", "—", "—", "—", "—"]);
  assert.equal(t.notes.revenue, "Loading…");
});

test("(b) a successful fetch renders server values with honest projection notes", () => {
  const server = {
    businessHealth: { score: 61, kind: "inference" },
    opportunityCount: 1,
    potentialAnnualRevenue: { amount: 45408, kind: "projection", confidence: "medium", timeHorizon: "12 months" },
    growthOpportunities: [{ assumptions: ["Assumed a 20% close rate…"] }],
    operationalIssueCount: 0,
    recommendedAutomation: { title: "Automate invoicing" }
  };
  const t = auditTiles(server);
  assert.equal(t.health, "61");
  assert.equal(t.healthWidth, 61);
  assert.equal(t.opportunities, "1");
  assert.equal(t.revenue, "$45K");
  assert.equal(t.issues, "0");
  assert.equal(t.automation, "1");
  assert.match(t.notes.revenue, /Projection/);
  assert.match(t.notes.revenue, /medium confidence/);
  assert.match(t.notes.revenue, /1 assumption/);
  assert.equal(t.notes.issues, "None detected yet");
});

test("(b2) unknown health and unknown revenue render em dashes, not zeros or guesses", () => {
  const t = auditTiles({ businessHealth: { score: null, kind: "unknown" }, opportunityCount: 0, potentialAnnualRevenue: { amount: null, kind: "unknown", note: "No revenue signals connected yet." }, operationalIssueCount: 0, recommendedAutomation: null });
  assert.equal(t.health, "—");
  assert.equal(t.healthWidth, 0);
  assert.equal(t.revenue, "—");
  assert.equal(t.notes.revenue, "No revenue signals connected yet.");
  assert.equal(t.notes.automation, "None recommended yet");
});

test("(c) a failed fetch renders an explicit unavailable state", () => {
  const t = unavailableTiles();
  assert.deepEqual(tileValues(t), ["—", "—", "—", "—", "—"]);
  for (const note of Object.values(t.notes)) assert.equal(note, "Results temporarily unavailable");
});

test("(d) fixture mode renders exactly 78 / 3 / $42K / 2 / 1 with approved captions", () => {
  const t = auditTiles(PREVIEW_AUDIT_RESULT);
  assert.deepEqual(tileValues(t), ["78", "3", "$42K", "2", "1"]);
  assert.equal(t.healthWidth, 78);
  assert.equal(t.notes.opportunities, "Highest-impact paths identified");
  assert.equal(t.notes.revenue, "Evidence-based estimate");
  assert.equal(t.notes.issues, "Both are actionable");
  assert.equal(t.notes.automation, "Approval required");
});

test("(e) real mode never uses fixed recommendations/agents; preview mode does", () => {
  const previews = { recommendations: [{ title: "demo" }], agents: [{ name: "demo" }] };
  const real = resolveCollections(false, {}, previews);
  assert.deepEqual(real.recommendations, []);
  assert.deepEqual(real.agents, []);
  const realWithData = resolveCollections(false, { recommendations: [{ title: "server" }], agents: [{ name: "server" }] }, previews);
  assert.deepEqual(realWithData.recommendations, [{ title: "server" }]);
  const preview = resolveCollections(true, {}, previews);
  assert.deepEqual(preview.recommendations, previews.recommendations);
  assert.deepEqual(preview.agents, previews.agents);
});

test("currency formatting is robust and avoids false precision", () => {
  assert.equal(formatMoney({ amount: 45408 }), "$45K");
  assert.equal(formatMoney({ amount: 2_400_000 }), "$2.4M");
  assert.equal(formatMoney({ amount: 950 }), "$950");
  assert.equal(formatMoney({ amount: null }), "—");
  assert.equal(formatMoney({ amount: Number.NaN }), "—");
  assert.equal(formatMoney(undefined), "—");
});
