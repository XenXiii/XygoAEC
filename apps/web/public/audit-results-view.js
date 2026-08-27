const dash = "—";
const money = (value) => value == null || !Number.isFinite(Number(value)) ? dash : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));

export const loadingAuditTiles = () => ({ health: dash, opportunities: dash, revenue: dash, issues: dash, automation: dash, note: "Loading audit results…" });
export const unavailableAuditTiles = () => ({ health: dash, opportunities: dash, revenue: dash, issues: dash, automation: dash, note: "Audit results temporarily unavailable." });

export function auditTiles(result) {
  if (!result) return loadingAuditTiles();
  const score = result.businessHealth?.score;
  const revenue = result.potentialAnnualRevenue;
  return {
    health: score == null ? dash : String(score),
    opportunities: String(result.opportunityCount ?? 0),
    revenue: revenue?.kind === "unknown" ? dash : money(revenue?.amount),
    issues: String(result.operationalIssueCount ?? 0),
    automation: result.recommendedAutomation ? "1" : "0",
    note: revenue?.kind === "unknown" ? (revenue.note ?? "Revenue is unknown.") : `${revenue.kind} · ${revenue.confidence ?? "low"} confidence · ${revenue.timeHorizon ?? "time horizon unavailable"}`
  };
}
