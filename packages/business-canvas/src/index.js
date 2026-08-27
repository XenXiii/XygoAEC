import { canAccessAuditSection } from "../../audit-engine/src/index.js";

export function projectBusinessCanvas(state, entitlement = "free") {
  const facts = Object.values(state.facts);
  const panel = (id, stages) => ({ id, items: facts.filter((fact) => stages.includes(fact.stage)).map((fact) => ({ id: fact.id, label: fact.key, value: fact.value, confidence: fact.confidence, evidenceRef: fact.evidenceRef ?? null })) });
  return {
    workspaceId: state.workspaceId, readiness: state.readiness, dataHealth: { evidenceCoverage: state.evidenceCoverage, confidence: state.confidence, conflicts: state.conflicts.length },
    panels: [
      panel("business_model", ["business_profile", "goals_and_growth", "revenue_and_unit_economics"]),
      panel("journey_and_workflow", ["sales_and_lead_management", "customer_experience_and_retention", "operations_and_delivery"]),
      panel("team_and_systems", ["staffing_ownership_and_handoffs", "systems_and_integrations"]),
      panel("kpis_and_risk", ["finance_and_margin", "data_quality_and_reporting", "risk_compliance_and_governance"])
    ],
    locked: !canAccessAuditSection({ entitlement, section: "scenarios" })
  };
}
