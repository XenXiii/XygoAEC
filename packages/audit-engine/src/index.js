export const AUDIT_STAGES = Object.freeze([
  "business_profile", "goals_and_growth", "revenue_and_unit_economics",
  "sales_and_lead_management", "customer_experience_and_retention",
  "operations_and_delivery", "staffing_ownership_and_handoffs", "finance_and_margin",
  "systems_and_integrations", "data_quality_and_reporting",
  "risk_compliance_and_governance", "findings_and_prioritization"
]);

const CONFIDENCE = new Set(["low", "medium", "high"]);
const SOURCES = new Set(["connected", "imported", "manual", "conversation"]);

function required(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
}

export function createAuditState({ workspaceId, conversationId, now = new Date().toISOString() }) {
  required(workspaceId, "workspaceId");
  required(conversationId, "conversationId");
  return {
    workspaceId, conversationId, currentStage: AUDIT_STAGES[0], completedStages: [],
    facts: {}, conflicts: [], evidenceCoverage: 0, confidence: "low",
    readiness: 0, freeResultEligible: false, updatedAt: now
  };
}

export function validateFact(fact, workspaceId) {
  const allowed = new Set(["id", "workspaceId", "stage", "key", "value", "sourceType", "evidenceRef", "confidence", "owner", "updatedAt"]);
  for (const key of Object.keys(fact ?? {})) if (!allowed.has(key)) throw new Error(`Unknown fact field: ${key}`);
  required(fact?.id, "fact.id"); required(fact?.key, "fact.key");
  if (fact.workspaceId !== workspaceId) throw new Error("Cross-workspace fact rejected.");
  if (!AUDIT_STAGES.includes(fact.stage)) throw new Error(`Unknown audit stage: ${fact.stage}`);
  if (!SOURCES.has(fact.sourceType)) throw new Error(`Unknown source type: ${fact.sourceType}`);
  if (!CONFIDENCE.has(fact.confidence)) throw new Error(`Unknown confidence: ${fact.confidence}`);
  if (fact.value === undefined || fact.value === null) throw new Error("fact.value is required.");
  return Object.freeze({ ...fact });
}

export function applyFact(state, input) {
  const fact = validateFact(input, state.workspaceId);
  const existing = state.facts[fact.key];
  const conflicts = state.conflicts.filter((item) => item.key !== fact.key);
  if (existing && JSON.stringify(existing.value) !== JSON.stringify(fact.value)) {
    conflicts.push({ key: fact.key, factIds: [existing.id, fact.id], status: "unresolved" });
  }
  return recalculate({ ...state, facts: { ...state.facts, [fact.key]: fact }, conflicts, updatedAt: fact.updatedAt ?? new Date().toISOString() });
}

export function completeStage(state, stage) {
  if (!AUDIT_STAGES.includes(stage)) throw new Error(`Unknown audit stage: ${stage}`);
  const completedStages = [...new Set([...state.completedStages, stage])];
  const next = AUDIT_STAGES.find((item) => !completedStages.includes(item)) ?? AUDIT_STAGES.at(-1);
  return recalculate({ ...state, completedStages, currentStage: next });
}

function recalculate(state) {
  const facts = Object.values(state.facts);
  const evidenced = facts.filter((fact) => fact.evidenceRef).length;
  const weights = { low: 1, medium: 2, high: 3 };
  const average = facts.length ? facts.reduce((sum, fact) => sum + weights[fact.confidence], 0) / facts.length : 1;
  const evidenceCoverage = facts.length ? Math.round((evidenced / facts.length) * 100) : 0;
  const readiness = Math.round(((state.completedStages.length / AUDIT_STAGES.length) * 70) + (evidenceCoverage * 0.3));
  return { ...state, evidenceCoverage, confidence: average >= 2.5 ? "high" : average >= 1.5 ? "medium" : "low", readiness, freeResultEligible: readiness >= 25 && state.conflicts.length === 0 };
}

export function canAccessAuditSection({ entitlement, section, recommendationIndex = 0 }) {
  if (entitlement === "active" || entitlement === "trialing") return true;
  if (["progress", "data_health", "plan_comparison"].includes(section)) return true;
  return section === "recommendation" && recommendationIndex === 0;
}
