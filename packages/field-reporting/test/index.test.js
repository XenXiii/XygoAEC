import test from "node:test";
import assert from "node:assert/strict";

import {
  createFieldReport,
  generateReportDraft,
  setReviewStatus,
  toClientView
} from "../src/index.js";

function report(overrides = {}) {
  return createFieldReport({
    id: "fr-1",
    tenantId: "tenant-commercial-sim",
    projectId: "project-commercial-b",
    siteName: "Level 2 Core",
    reportType: "daily_log",
    author: "field-lead-1",
    staged: true,
    observations: [
      { kind: "note", text: "Poured slab section B" },
      { kind: "checklist", label: "Rebar inspected", checked: true },
      { kind: "checklist", label: "Safety rails installed", checked: false },
      { kind: "photo", caption: "East elevation", placeholderRef: "staged/photo-1" },
      { kind: "voice", transcriptPlaceholder: "Crew noted delayed delivery" }
    ],
    ...overrides
  });
}

test("intake validates required fields, report type, and staged flag", () => {
  assert.throws(() => createFieldReport({ id: "x", tenantId: "t", projectId: "p", siteName: "s", reportType: "daily_log", author: "a" }), /staged/);
  assert.throws(() => report({ reportType: "unknown" }), /Unknown report type/);
  assert.throws(() => report({ author: "" }), /Author/);
});

test("intake normalizes observations and starts as captured", () => {
  const r = report();
  assert.equal(r.status, "captured");
  assert.equal(r.observations.length, 5);
  assert.equal(r.clientVisible, false);
  assert.equal(r.draft, null);
});

test("intake rejects unknown observation kinds", () => {
  assert.throws(() => report({ observations: [{ kind: "video" }] }), /unknown kind/);
});

test("draft generation is deterministic and simulated", () => {
  const a = generateReportDraft(report());
  const b = generateReportDraft(report());
  assert.deepEqual(a.draft, b.draft);
  assert.equal(a.status, "draft_generated");
  assert.equal(a.draft.aiGenerated, true);
  assert.equal(a.draft.simulated, true);
  assert.match(a.draft.summary, /SIMULATED/);
  // Open checklist item surfaced in the summary.
  assert.match(a.draft.summary, /1 open checklist/);
});

test("review requires a draft first", () => {
  assert.throws(() => setReviewStatus(report(), "approved"), /draft must be generated/);
});

test("review transitions and client-visibility gate", () => {
  const drafted = generateReportDraft(report());

  const inReview = setReviewStatus(drafted, "in_review", { reviewedBy: "pm-1" });
  assert.equal(inReview.status, "in_review");
  assert.equal(inReview.clientVisible, false);

  const approved = setReviewStatus(inReview, "approved", { reviewedBy: "pm-1" });
  assert.equal(approved.status, "approved");
  assert.equal(approved.clientVisible, true);

  assert.throws(() => setReviewStatus(drafted, "published"), /Unknown review status/);
});

test("client view only exposes approved reports", () => {
  const drafted = generateReportDraft(report());
  assert.equal(toClientView(drafted), null);

  const approved = setReviewStatus(drafted, "approved", { reviewedBy: "pm-1" });
  const view = toClientView(approved);
  assert.equal(view.status, "approved");
  assert.equal(view.title, "daily_log — Level 2 Core");
  assert.ok(Array.isArray(view.sections));
  // Internal review metadata is not exposed to the client.
  assert.equal(view.reviewedBy, undefined);
});
