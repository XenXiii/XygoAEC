// Evidence-backed audit results synthesis.
//
// Every headline value the client sees (business health, opportunity count,
// potential annual revenue, operational issues, recommended automation) is
// DERIVED HERE from persisted audit facts — never hardcoded. Each value declares
// its provenance, confidence, assumptions, time horizon, and the evidence it
// rests on, and observed facts are kept distinct from inferences and projections.
//
// When the evidence is thin the synthesis says so (low confidence, "unknown"
// values, explicit unknowns) rather than manufacturing precision.

// Minimum evidence before a numeric business-health score is responsible.
const MIN_FACTS_FOR_SCORE = 3;
const MIN_EVIDENCED_FACTS = 2;

const CONFIDENCE_ORDER = ["low", "medium", "high"];
const minConfidence = (values) =>
  values.length ? CONFIDENCE_ORDER[Math.min(...values.map((c) => CONFIDENCE_ORDER.indexOf(c)).filter((i) => i >= 0))] : "low";
const downgrade = (confidence) => CONFIDENCE_ORDER[Math.max(0, CONFIDENCE_ORDER.indexOf(confidence) - 1)];
const round = (n) => Math.round(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// The signal categories the audit tries to cover; used to report unknowns.
const SIGNAL_CATEGORIES = {
  sales: ["sales_and_lead_management", "revenue_and_unit_economics"],
  marketing: ["goals_and_growth", "customer_experience_and_retention"],
  operations: ["operations_and_delivery", "staffing_ownership_and_handoffs"],
  finance: ["finance_and_margin"]
};

function factList(state) {
  return Object.values(state?.facts ?? {});
}
function fact(state, key) {
  return state?.facts?.[key] ?? null;
}
function numeric(f) {
  return f && typeof f.value === "number" && Number.isFinite(f.value) ? f.value : null;
}

// --- Business health: an inference from evidence coverage, confidence, and conflicts.
// Below the minimum evidence threshold there is no number — only an explicit unknown.
function synthesizeHealth(state) {
  const facts = factList(state);
  const evidenced = facts.filter((f) => f.evidenceRef).length;
  const evidenceCoverage = state.evidenceCoverage ?? 0;
  const conflicts = state.conflicts?.length ?? 0;

  if (facts.length < MIN_FACTS_FOR_SCORE || evidenced < MIN_EVIDENCED_FACTS) {
    return {
      score: null,
      kind: "unknown",
      confidence: "low",
      evidenceCoverage,
      note: "Not enough evidence to score business health yet.",
      assumptions: [
        `A score needs at least ${MIN_FACTS_FOR_SCORE} facts (${MIN_EVIDENCED_FACTS} with evidence); currently ${facts.length} fact(s), ${evidenced} with evidence.`,
        "Connect more business data to unlock a health score."
      ]
    };
  }

  const confidenceBonus = { low: 0, medium: 8, high: 16 }[state.confidence ?? "low"];
  const score = clamp(round(45 + evidenceCoverage * 0.4 + confidenceBonus - conflicts * 10), 0, 100);
  const assumptions = [
    `Derived from ${facts.length} recorded fact(s), ${evidenced} with evidence.`,
    "Provisional until more business signals are connected."
  ];
  if (conflicts) assumptions.push(`${conflicts} unresolved data conflict(s) reduced the score.`);
  return { score, kind: "inference", confidence: state.confidence ?? "low", evidenceCoverage, assumptions };
}

// --- Revenue opportunity from stalled sales pipeline (a projection, clearly flagged).
function stalledPipelineOpportunity(state) {
  const stalled = fact(state, "sales.stalled_leads");
  const count = numeric(stalled);
  if (count === null || count <= 0) return null;

  const avgDealFact = fact(state, "sales.avg_deal_value");
  const closeRateFact = fact(state, "sales.close_rate");
  const assumptions = [];

  let avgDeal = numeric(avgDealFact);
  const avgAssumed = avgDeal === null;
  if (avgAssumed) { avgDeal = 5000; assumptions.push("Assumed average deal value of $5,000 (no connected value)."); }
  let closeRate = numeric(closeRateFact);
  const closeAssumed = closeRate === null;
  if (closeAssumed) { closeRate = 0.2; assumptions.push("Assumed a 20% close rate on re-engaged leads (no connected value)."); }

  // A single count multiplied by two assumed economics is too weak to project
  // responsibly. Keep the opportunity (the stalled leads are real) but mark its
  // revenue explicitly unknown and name the missing inputs, rather than guessing.
  if (avgAssumed && closeAssumed) {
    return {
      title: `Re-engage ${count} stalled leads`,
      potentialAnnualRevenue: { amount: null, currency: "USD", kind: "unknown" },
      kind: "unknown",
      confidence: "low",
      timeHorizon: "12 months",
      assumptions: [],
      missingInputs: ["sales.avg_deal_value", "sales.close_rate"],
      note: "Add average deal value and close rate to estimate the revenue impact.",
      evidence: [stalled.evidenceRef].filter(Boolean)
    };
  }

  const amount = round(count * avgDeal * closeRate);
  const inputs = [stalled, avgDealFact, closeRateFact].filter(Boolean);
  let confidence = minConfidence(inputs.map((f) => f.confidence));
  if (avgAssumed || closeAssumed) confidence = downgrade(confidence);

  return {
    title: `Re-engage ${count} stalled leads`,
    potentialAnnualRevenue: { amount, currency: "USD" },
    kind: "projection",
    confidence,
    timeHorizon: "12 months",
    assumptions,
    evidence: inputs.map((f) => f.evidenceRef).filter(Boolean)
  };
}

function synthesizeOpportunities(state) {
  return [stalledPipelineOpportunity(state)].filter(Boolean);
}

// --- Operational issues: unresolved conflicts (facts) and fact keys that name a break (inference).
function synthesizeIssues(state) {
  const issues = [];
  for (const conflict of state.conflicts ?? []) {
    issues.push({ title: `Conflicting data for "${conflict.key}"`, kind: "fact", severity: "medium", evidence: conflict.factIds ?? [] });
  }
  for (const f of factList(state)) {
    if (/broken|error|failed|manual_review|stuck/i.test(f.key)) {
      issues.push({ title: `Attention needed: ${f.key}`, kind: "inference", severity: "medium", evidence: f.evidenceRef ? [f.evidenceRef] : [] });
    }
  }
  return issues;
}

function synthesizeAutomation(state) {
  const candidate = factList(state).find((f) => /manual|repetitive|handoff|re[_-]?entry/i.test(f.key));
  if (!candidate) return null;
  return {
    title: `Automate: ${candidate.key}`,
    rationale: "A recurring manual step was recorded; automating it reduces handoff delay and error.",
    kind: "inference",
    confidence: candidate.confidence,
    evidence: candidate.evidenceRef ? [candidate.evidenceRef] : []
  };
}

function classify(state, health, opportunities, issues) {
  const facts = factList(state);
  const unknowns = [];
  for (const [category, stages] of Object.entries(SIGNAL_CATEGORIES)) {
    if (!facts.some((f) => stages.includes(f.stage))) unknowns.push(`${category} signals not yet connected`);
  }
  if (health.score == null) unknowns.push("business health (insufficient evidence)");
  for (const o of opportunities) {
    if (o.potentialAnnualRevenue?.amount == null) unknowns.push(`revenue for "${o.title}" (missing ${(o.missingInputs ?? []).join(" and ") || "supporting data"})`);
  }
  const inferences = [];
  if (health.score != null) inferences.push({ type: "business_health", detail: `score ${health.score}` });
  inferences.push(...issues.filter((i) => i.kind === "inference").map((i) => ({ type: "operational_issue", detail: i.title })));
  return {
    facts: facts.map((f) => ({ key: f.key, value: f.value, confidence: f.confidence, evidenceRef: f.evidenceRef ?? null })),
    inferences,
    projections: opportunities.filter((o) => o.potentialAnnualRevenue?.amount != null).map((o) => ({ type: "revenue_opportunity", detail: o.title })),
    unknowns
  };
}

export function synthesizeAuditResult({ objective = null, business = null, state }) {
  if (!state) throw Object.assign(new Error("An audit state is required."), { status: 400 });
  const health = synthesizeHealth(state);
  const opportunities = synthesizeOpportunities(state);
  const issues = synthesizeIssues(state);
  const recommendedAutomation = synthesizeAutomation(state);
  const quantified = opportunities.filter((o) => o.potentialAnnualRevenue?.amount != null);
  const totalRevenue = quantified.reduce((sum, o) => sum + o.potentialAnnualRevenue.amount, 0);

  return {
    objective,
    business: business ? { businessName: business.businessName ?? null, industry: business.industry ?? null } : null,
    businessHealth: health,
    growthOpportunities: opportunities,
    opportunityCount: opportunities.length,
    potentialAnnualRevenue: quantified.length
      ? { amount: totalRevenue, currency: "USD", kind: "projection", confidence: minConfidence(quantified.map((o) => o.confidence)), timeHorizon: "12 months" }
      : { amount: null, currency: "USD", kind: "unknown", confidence: "low", note: "No revenue signals strong enough to estimate yet." },
    operationalIssues: issues,
    operationalIssueCount: issues.length,
    recommendedAutomation,
    provenance: {
      generatedFrom: "objective + business profile + persisted audit facts",
      factCount: factList(state).length,
      evidencedFactCount: factList(state).filter((f) => f.evidenceRef).length,
      conflicts: state.conflicts?.length ?? 0,
      readiness: state.readiness ?? 0
    },
    classification: classify(state, health, opportunities, issues)
  };
}
