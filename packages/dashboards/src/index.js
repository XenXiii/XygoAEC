function groupCount(items, key) {
  return items.reduce((accumulator, item) => {
    const groupKey = item[key] ?? "unknown";
    accumulator[groupKey] = (accumulator[groupKey] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function buildProjectManagerDashboard(input) {
  return {
    projectId: input.projectId,
    milestoneCount: input.milestones?.length ?? 0,
    openRfiCount: input.rfis?.filter((rfi) => rfi.status !== "closed").length ?? 0,
    openIssueCount:
      input.issues?.filter((issue) => !["closed", "resolved"].includes(issue.status)).length ?? 0,
    pendingApprovalCount:
      input.approvals?.filter((approval) => approval.status === "pending").length ?? 0,
    permitStatus: input.permitPackage?.status ?? "not_started",
    staged: true
  };
}

export function buildDisciplineLeadDashboard(input) {
  return {
    discipline: input.discipline,
    assignedReviewCount: input.reviewSessions?.length ?? 0,
    returnedRevisionCount:
      input.drawings?.filter((drawing) => drawing.lifecycleStatus === "returned_for_revision").length ??
      0,
    aiFindingCount: input.findings?.filter((finding) => finding.humanDisposition === "pending").length ?? 0,
    conflictCount:
      input.issues?.filter((issue) => issue.disciplines?.includes(input.discipline)).length ?? 0,
    staged: true
  };
}

export function buildExecutivePortfolioView(input) {
  return {
    tenantId: input.tenantId,
    totalProjects: input.projects?.length ?? 0,
    projectStatuses: groupCount(input.projects ?? [], "status"),
    highSeverityIssueCount:
      input.issues?.filter((issue) => issue.severity === "high").length ?? 0,
    pendingFinanceReviewCount:
      input.financeEvents?.filter((event) => event.requiresFinanceReview === true).length ?? 0,
    pendingLegalReviewCount:
      input.financeEvents?.filter((event) => event.requiresLegalReview === true).length ?? 0,
    permitDelays:
      input.permitPackages?.filter((permitPackage) =>
        ["reviewer_comments_received", "revision_required"].includes(permitPackage.status)
      ).length ?? 0,
    staged: true
  };
}

export function buildReviewQueues(input) {
  return {
    aiReviewQueue: input.findings?.filter((finding) => finding.humanDisposition === "pending") ?? [],
    approvalQueue: input.approvals?.filter((approval) => approval.status === "pending") ?? [],
    permitQueue:
      input.permitPackages?.filter((permitPackage) => permitPackage.status !== "closed") ?? [],
    staged: true
  };
}

export function buildTransferQueue(input) {
  return {
    stagedTransfers:
      input.transferPackages?.map((transferPackage) => ({
        id: transferPackage.id,
        destinationProvider: transferPackage.destinationProvider,
        approvalStatus: transferPackage.approvalStatus ?? "pending"
      })) ?? [],
    staged: true
  };
}
