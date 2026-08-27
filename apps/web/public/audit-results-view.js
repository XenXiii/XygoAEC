// Pure view logic for the audit-results tiles. No DOM here — every function maps
// data to the exact text/width the tiles should show, so the rendering contract
// is testable without a browser. app-shell.js applies these outputs via
// textContent. Fixture/demo numbers only ever enter through PREVIEW_AUDIT_RESULT.

const DASH = "—";
const clampScore = (n) => Math.max(0, Math.min(100, Number(n) || 0));

// Robust currency: never implies false precision; degrades to an em dash.
export function formatMoney(revenue) {
  const amount = revenue?.amount;
  if (amount == null || !Number.isFinite(Number(amount))) return DASH;
  const value = Math.round(Number(amount));
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value}`;
}

function revenueNote(result) {
  const rev = result?.potentialAnnualRevenue;
  if (!rev || rev.kind === "unknown" || rev.amount == null) return rev?.note ?? "Not enough data yet";
  const assumptionCount = (result.growthOpportunities ?? []).reduce((n, o) => n + (o.assumptions?.length || 0), 0);
  const parts = [rev.kind === "projection" ? "Projection" : "Estimate", `${rev.confidence ?? "low"} confidence`];
  if (rev.timeHorizon) parts.push(rev.timeHorizon);
  parts.push(assumptionCount ? `${assumptionCount} assumption${assumptionCount > 1 ? "s" : ""}` : "evidence-backed");
  return parts.join(" · ");
}

// Neutral placeholders shown before the authenticated result arrives.
export function loadingTiles() {
  return { health: DASH, healthWidth: 0, opportunities: DASH, revenue: DASH, issues: DASH, automation: DASH,
    notes: { opportunities: "Loading…", revenue: "Loading…", issues: "Loading…", automation: "Loading…" } };
}

// Shown when the audit-result request fails — never falls back to preview data.
export function unavailableTiles() {
  const note = "Results temporarily unavailable";
  return { health: DASH, healthWidth: 0, opportunities: DASH, revenue: DASH, issues: DASH, automation: DASH,
    notes: { opportunities: note, revenue: note, issues: note, automation: note } };
}

export function auditTiles(result) {
  if (!result) return loadingTiles();
  const score = result.businessHealth?.score;
  const overrides = result.notes ?? {};
  const opportunityCount = result.opportunityCount ?? 0;
  const issueCount = result.operationalIssueCount ?? 0;
  return {
    health: score == null ? DASH : String(score),
    healthWidth: score == null ? 0 : clampScore(score),
    opportunities: String(opportunityCount),
    revenue: formatMoney(result.potentialAnnualRevenue),
    issues: String(issueCount),
    automation: String(result.recommendedAutomation ? 1 : 0),
    notes: {
      opportunities: overrides.opportunities ?? (opportunityCount > 0 ? "Highest-impact paths identified" : "No opportunities identified yet"),
      revenue: overrides.revenue ?? revenueNote(result),
      issues: overrides.issues ?? (issueCount > 0 ? "Actionable" : "None detected yet"),
      automation: overrides.automation ?? (result.recommendedAutomation ? "Approval required" : "None recommended yet")
    }
  };
}

// Which recommendation/agent collections a session may render. Real sessions may
// only use persisted server data; preview arrays are never used for real users.
export function resolveCollections(preview, data = {}, previews = {}) {
  return {
    recommendations: preview ? (previews.recommendations ?? []) : (data.recommendations ?? []),
    agents: preview ? (previews.agents ?? []) : (data.agents ?? [])
  };
}

// The single source of the approved fixture numbers (78 / 3 / $42K / 2 / 1) and
// their approved captions. Used by both app-shell fixture mode and its tests.
export const PREVIEW_AUDIT_RESULT = Object.freeze({
  businessHealth: { score: 78 },
  opportunityCount: 3,
  potentialAnnualRevenue: { amount: 42000, kind: "projection" },
  operationalIssueCount: 2,
  recommendedAutomation: { title: "Preview automation" },
  notes: {
    opportunities: "Highest-impact paths identified",
    revenue: "Evidence-based estimate",
    issues: "Both are actionable",
    automation: "Approval required"
  }
});
