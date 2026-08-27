const HEALTH_MIN_SIGNALS = 3;
const HEALTH_MIN_EVIDENCED_FINDINGS = 2;

const unresolvedIssue = (item) => !["closed", "resolved"].includes(String(item?.status ?? "").toLowerCase());
const pendingFinding = (item) => String(item?.humanDisposition ?? "pending").toLowerCase() === "pending";
const delayedPermit = (item) => ["revision_required", "blocked", "delayed"].includes(String(item?.status ?? "").toLowerCase());
const evidenceFor = (finding) => Array.isArray(finding?.evidenceReferences) ? finding.evidenceReferences.filter(Boolean) : [];

export function synthesizeTenantAuditResult({ tenantId, projects = [], issues = [], findings = [], permits = [] } = {}) {
  if (!tenantId) throw Object.assign(new Error("tenantId is required."), { status: 400 });

  const openIssues = issues.filter(unresolvedIssue);
  const pendingFindings = findings.filter(pendingFinding);
  const permitDelays = permits.filter(delayedPermit);
  const evidencedFindings = pendingFindings.filter((finding) => evidenceFor(finding).length > 0);
  const signalCount = [projects.length, openIssues.length, pendingFindings.length, permits.length].filter((count) => count > 0).length;
  const canScore = signalCount >= HEALTH_MIN_SIGNALS && evidencedFindings.length >= HEALTH_MIN_EVIDENCED_FINDINGS;
  const operationalIssueCount = openIssues.length + pendingFindings.length + permitDelays.length;
  const opportunities = [];

  if (pendingFindings.length) {
    opportunities.push({
      title: `Review ${pendingFindings.length} pending AI finding${pendingFindings.length === 1 ? "" : "s"}`,
      kind: "fact",
      confidence: evidencedFindings.length === pendingFindings.length ? "high" : "medium",
      evidence: pendingFindings.flatMap(evidenceFor)
    });
  }
  if (openIssues.length) {
    opportunities.push({
      title: `Resolve ${openIssues.length} open coordination issue${openIssues.length === 1 ? "" : "s"}`,
      kind: "fact",
      confidence: "medium",
      evidence: openIssues.map((issue) => issue.id).filter(Boolean)
    });
  }
  if (permitDelays.length) {
    opportunities.push({
      title: `Address ${permitDelays.length} delayed permit package${permitDelays.length === 1 ? "" : "s"}`,
      kind: "fact",
      confidence: "medium",
      evidence: permitDelays.map((permit) => permit.id).filter(Boolean)
    });
  }

  const health = canScore
    ? {
        score: Math.max(0, Math.min(100, Math.round(92 - operationalIssueCount * 4))),
        kind: "inference",
        confidence: evidencedFindings.length >= 3 ? "high" : "medium",
        assumptions: ["Score is provisional and derived only from canonical project, issue, finding, and permit signals."]
      }
    : {
        score: null,
        kind: "unknown",
        confidence: "low",
        note: "Not enough evidence to score business health yet.",
        assumptions: [`A score requires ${HEALTH_MIN_SIGNALS} signal categories and ${HEALTH_MIN_EVIDENCED_FINDINGS} evidenced findings; currently ${signalCount} and ${evidencedFindings.length}.`]
      };

  return {
    tenantId,
    businessHealth: health,
    growthOpportunities: opportunities,
    opportunityCount: opportunities.length,
    potentialAnnualRevenue: {
      amount: null,
      currency: "USD",
      kind: "unknown",
      confidence: "low",
      note: "No verified revenue inputs are connected."
    },
    operationalIssues: [
      ...openIssues.map((issue) => ({ id: issue.id, title: issue.title ?? issue.id, kind: "fact", source: "coordination_issue" })),
      ...pendingFindings.map((finding) => ({ id: finding.id, title: finding.title ?? finding.id, kind: "fact", source: "ai_finding", evidence: evidenceFor(finding) })),
      ...permitDelays.map((permit) => ({ id: permit.id, title: permit.id, kind: "fact", source: "permit_package" }))
    ],
    operationalIssueCount,
    recommendedAutomation: null,
    provenance: {
      generatedFrom: "canonical tenant projects + coordination issues + AI findings + permit packages",
      projectCount: projects.length,
      issueCount: issues.length,
      findingCount: findings.length,
      evidencedFindingCount: evidencedFindings.length,
      permitCount: permits.length
    },
    classification: {
      facts: opportunities.map((item) => ({ type: "operational_opportunity", detail: item.title })),
      inferences: canScore ? [{ type: "business_health", detail: `score ${health.score}` }] : [],
      projections: [],
      unknowns: [
        ...(canScore ? [] : ["business health (insufficient evidence)"]),
        "potential annual revenue (no verified revenue inputs)"
      ]
    }
  };
}
