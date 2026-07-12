import test from "node:test";
import assert from "node:assert/strict";

import { createBoardSections, createSummaryCards, formatStatusTone } from "../src/view-models.js";

test("summary cards normalize executive metrics", () => {
  const cards = createSummaryCards({
    totalProjects: 4,
    highSeverityIssueCount: 2,
    pendingFinanceReviewCount: 1,
    pendingLegalReviewCount: 3,
    permitDelays: 5
  });

  assert.equal(cards.length, 5);
  assert.equal(cards[0].value, 4);
  assert.equal(cards[4].value, 5);
});

test("board sections map workflow groups", () => {
  const sections = createBoardSections({
    projects: [{ id: "p1" }],
    issues: [{ id: "i1" }],
    rfis: [],
    permits: [],
    reviewSessions: [],
    aiFindings: [{ id: "f1" }]
  });

  assert.equal(sections.length, 6);
  assert.equal(sections[0].items.length, 1);
  assert.equal(sections[5].items.length, 1);
});

test("status tone formatting separates warning and success states", () => {
  assert.equal(formatStatusTone("open"), "warning");
  assert.equal(formatStatusTone("accepted"), "success");
  assert.equal(formatStatusTone("draft"), "neutral");
});
