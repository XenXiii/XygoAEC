export function createSummaryCards(summary = {}) {
  return [
    {
      key: "projects",
      label: "Projects",
      value: summary.totalProjects ?? 0
    },
    {
      key: "issues",
      label: "High Severity Issues",
      value: summary.highSeverityIssueCount ?? 0
    },
    {
      key: "finance",
      label: "Finance Reviews",
      value: summary.pendingFinanceReviewCount ?? 0
    },
    {
      key: "legal",
      label: "Legal Reviews",
      value: summary.pendingLegalReviewCount ?? 0
    },
    {
      key: "permits",
      label: "Permit Delays",
      value: summary.permitDelays ?? 0
    }
  ];
}

export function createBoardSections(data = {}) {
  return [
    {
      key: "projects",
      title: "Projects",
      empty: "No staged projects yet.",
      items: data.projects ?? []
    },
    {
      key: "issues",
      title: "Coordination Issues",
      empty: "No staged coordination issues yet.",
      items: data.issues ?? []
    },
    {
      key: "rfis",
      title: "RFIs",
      empty: "No staged RFIs yet.",
      items: data.rfis ?? []
    },
    {
      key: "permits",
      title: "Permit Packages",
      empty: "No staged permit packages yet.",
      items: data.permits ?? []
    },
    {
      key: "reviews",
      title: "Review Sessions",
      empty: "No staged review sessions yet.",
      items: data.reviewSessions ?? []
    },
    {
      key: "findings",
      title: "AI Findings",
      empty: "No staged AI findings yet.",
      items: data.aiFindings ?? []
    }
  ];
}

export function formatStatusTone(status = "") {
  if (["open", "submitted", "revision_required", "pending"].includes(status)) {
    return "warning";
  }

  if (["approved", "completed", "closed", "accepted"].includes(status)) {
    return "success";
  }

  return "neutral";
}
