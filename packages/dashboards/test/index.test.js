import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDisciplineLeadDashboard,
  buildExecutivePortfolioView,
  buildProjectManagerDashboard,
  buildReviewQueues,
  buildTransferQueue
} from "../src/index.js";

test("project manager dashboard summarizes active workflow counts", () => {
  const dashboard = buildProjectManagerDashboard({
    projectId: "project-a",
    milestones: [{}, {}],
    rfis: [{ status: "submitted" }, { status: "closed" }],
    issues: [{ status: "open" }, { status: "resolved" }],
    approvals: [{ status: "pending" }],
    permitPackage: { status: "revision_required" }
  });

  assert.equal(dashboard.milestoneCount, 2);
  assert.equal(dashboard.openRfiCount, 1);
  assert.equal(dashboard.openIssueCount, 1);
});

test("discipline lead dashboard filters by discipline", () => {
  const dashboard = buildDisciplineLeadDashboard({
    discipline: "architecture",
    reviewSessions: [{}, {}],
    drawings: [{ lifecycleStatus: "returned_for_revision" }],
    findings: [{ humanDisposition: "pending" }],
    issues: [{ disciplines: ["architecture", "structural"] }]
  });

  assert.equal(dashboard.conflictCount, 1);
  assert.equal(dashboard.aiFindingCount, 1);
});

test("executive portfolio view summarizes risks and review triggers", () => {
  const view = buildExecutivePortfolioView({
    tenantId: "tenant-a",
    projects: [{ status: "draft" }, { status: "draft" }, { status: "approved_for_construction" }],
    issues: [{ severity: "high" }],
    financeEvents: [{ requiresFinanceReview: true }, { requiresLegalReview: true }],
    permitPackages: [{ status: "revision_required" }]
  });

  assert.equal(view.totalProjects, 3);
  assert.equal(view.highSeverityIssueCount, 1);
  assert.equal(view.permitDelays, 1);
});

test("review queues and transfer queue remain staged", () => {
  const reviewQueues = buildReviewQueues({
    findings: [{ humanDisposition: "pending" }],
    approvals: [{ status: "pending" }],
    permitPackages: [{ status: "simulated_submitted" }]
  });
  const transferQueue = buildTransferQueue({
    transferPackages: [{ id: "transfer-a", destinationProvider: "procore" }]
  });

  assert.equal(reviewQueues.aiReviewQueue.length, 1);
  assert.equal(transferQueue.stagedTransfers.length, 1);
});
