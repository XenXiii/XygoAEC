import test from "node:test";
import assert from "node:assert/strict";
import { applyFact, createAuditState } from "../../audit-engine/src/index.js";
import { synthesizeAuditResult } from "../src/index.js";

const base = () => createAuditState({ workspaceId: "w-a", conversationId: "c-a", now: "t0" });
const withFact = (state, fact) => applyFact(state, { workspaceId: "w-a", updatedAt: "t1", ...fact });
const sales = (id, key, value, extra = {}) => ({ id, stage: "sales_and_lead_management", key, value, sourceType: "connected", confidence: "high", evidenceRef: `crm:${id}`, ...extra });

test("zero facts: health is unknown (null), revenue unknown, unknowns declared", () => {
  const result = synthesizeAuditResult({ objective: "grow revenue", business: { businessName: "X" }, state: base() });
  assert.equal(result.businessHealth.score, null);
  assert.equal(result.businessHealth.kind, "unknown");
  assert.equal(result.businessHealth.confidence, "low");
  assert.ok(result.businessHealth.note && result.businessHealth.assumptions.length);
  assert.equal(result.potentialAnnualRevenue.kind, "unknown");
  assert.equal(result.potentialAnnualRevenue.amount, null);
  assert.equal(result.opportunityCount, 0);
  assert.ok(result.classification.unknowns.includes("business health (insufficient evidence)"));
  assert.ok(!result.classification.inferences.some((i) => i.type === "business_health"));
});

test("below-threshold evidence keeps health unknown even with a couple facts", () => {
  let state = base();
  state = withFact(state, sales("f1", "sales.stalled_leads", 5)); // 1 evidenced
  state = withFact(state, sales("f2", "sales.avg_deal_value", 5000)); // 2 facts, but < MIN_FACTS_FOR_SCORE (3)
  const result = synthesizeAuditResult({ state });
  assert.equal(result.businessHealth.score, null);
  assert.equal(result.businessHealth.kind, "unknown");
});

test("sufficient evidence produces a numeric health inference", () => {
  let state = base();
  state = withFact(state, sales("f1", "sales.stalled_leads", 40));
  state = withFact(state, sales("f2", "sales.avg_deal_value", 6000));
  state = withFact(state, sales("f3", "sales.close_rate", 0.25, { sourceType: "manual", confidence: "medium" }));
  const result = synthesizeAuditResult({ state });
  assert.equal(typeof result.businessHealth.score, "number");
  assert.equal(result.businessHealth.kind, "inference");
  assert.ok(result.classification.inferences.some((i) => i.type === "business_health"));
});

test("both economics missing: opportunity is kept with explicit unknown revenue", () => {
  let state = base();
  state = withFact(state, sales("f1", "sales.stalled_leads", 43));
  const result = synthesizeAuditResult({ state });
  assert.equal(result.opportunityCount, 1);
  const opp = result.growthOpportunities[0];
  assert.equal(opp.kind, "unknown");
  assert.equal(opp.potentialAnnualRevenue.amount, null);
  assert.equal(opp.potentialAnnualRevenue.kind, "unknown");
  assert.deepEqual(opp.missingInputs, ["sales.avg_deal_value", "sales.close_rate"]);
  assert.match(opp.note, /average deal value and close rate/);
  assert.deepEqual(opp.assumptions, []);
  assert.equal(result.potentialAnnualRevenue.kind, "unknown");
  assert.equal(result.potentialAnnualRevenue.amount, null);
  assert.ok(result.classification.unknowns.some((u) => /revenue for "Re-engage 43 stalled leads"/.test(u)));
  assert.ok(!result.classification.projections.some((p) => p.detail === opp.title));
});

test("one assumed input yields a projection with downgraded confidence and visible assumptions", () => {
  let state = base();
  state = withFact(state, sales("f1", "sales.stalled_leads", 20));
  state = withFact(state, sales("f2", "sales.avg_deal_value", 5000)); // close rate still assumed
  const opp = synthesizeAuditResult({ state }).growthOpportunities[0];
  assert.equal(opp.kind, "projection");
  assert.equal(opp.potentialAnnualRevenue.amount, 20 * 5000 * 0.2);
  assert.equal(opp.confidence, "medium"); // high downgraded once
  assert.ok(opp.assumptions.some((a) => /Assumed a 20% close rate/.test(a)));
  assert.equal(opp.timeHorizon, "12 months");
});

test("fully-evidenced revenue is a projection with no assumptions at min confidence", () => {
  let state = base();
  state = withFact(state, sales("f1", "sales.stalled_leads", 43));
  state = withFact(state, sales("f2", "sales.avg_deal_value", 4800));
  state = withFact(state, sales("f3", "sales.close_rate", 0.22, { sourceType: "manual", confidence: "medium" }));
  const result = synthesizeAuditResult({ state });
  const opp = result.growthOpportunities[0];
  assert.equal(opp.potentialAnnualRevenue.amount, 43 * 4800 * 0.22);
  assert.deepEqual(opp.assumptions, []);
  assert.equal(opp.confidence, "medium"); // min(high, high, medium)
  assert.deepEqual(opp.evidence, ["crm:f1", "crm:f2", "crm:f3"]);
  assert.equal(result.potentialAnnualRevenue.kind, "projection");
  assert.equal(result.potentialAnnualRevenue.amount, 43 * 4800 * 0.22);
});

test("unresolved data conflicts become fact-grade operational issues", () => {
  let state = base();
  state = withFact(state, { id: "f1", stage: "finance_and_margin", key: "finance.mrr", value: 1000, sourceType: "connected", confidence: "high", evidenceRef: "stripe:1" });
  state = withFact(state, { id: "f2", stage: "finance_and_margin", key: "finance.mrr", value: 2000, sourceType: "imported", confidence: "high", evidenceRef: "sheet:1" });
  const result = synthesizeAuditResult({ state });
  assert.ok(result.operationalIssues.some((i) => i.kind === "fact" && /Conflicting data/.test(i.title)));
  assert.equal(result.provenance.conflicts, 1);
});

test("a recorded manual step yields an evidence-linked automation recommendation", () => {
  let state = base();
  state = withFact(state, { id: "f1", stage: "operations_and_delivery", key: "ops.manual_invoice_entry", value: "3h/week", sourceType: "conversation", confidence: "medium", evidenceRef: "message:c-a" });
  const result = synthesizeAuditResult({ state });
  assert.ok(result.recommendedAutomation);
  assert.equal(result.recommendedAutomation.kind, "inference");
  assert.deepEqual(result.recommendedAutomation.evidence, ["message:c-a"]);
});

test("synthesis requires an audit state", () => {
  assert.throws(() => synthesizeAuditResult({}), { status: 400 });
});
