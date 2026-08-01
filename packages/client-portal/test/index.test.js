import test from "node:test";
import assert from "node:assert/strict";

import { buildClientPortalView, paymentPlaceholder } from "../src/index.js";

const project = { id: "project-commercial-b", tenantId: "tenant-commercial-sim", name: "Commercial Building", status: "active" };

test("requires a project", () => {
  assert.throws(() => buildClientPortalView({}), /requires a project/);
});

test("payment block is always a non-actionable staged placeholder", () => {
  const payment = paymentPlaceholder();
  assert.equal(payment.status, "staged_no_billing");
  assert.equal(payment.balanceDue, null);
  assert.equal(payment.staged, true);

  const view = buildClientPortalView({ project });
  assert.deepEqual(view.payment, payment);
});

test("composes project status, reports, files, and sorted updates", () => {
  const view = buildClientPortalView({
    project,
    approvedReports: [{ id: "fr-1", status: "approved", title: "Daily log" }],
    files: [{ id: "file-1", originalFilename: "sheet.pdf", fileClass: "drawing_source" }],
    updates: [
      { id: "u2", at: "2026-07-16T10:00:00.000Z", message: "Level 2 complete" },
      { id: "u1", at: "2026-07-10T10:00:00.000Z", message: "Kickoff" }
    ]
  });

  assert.equal(view.projectStatus, "active");
  assert.equal(view.reports.length, 1);
  assert.equal(view.files[0].name, "sheet.pdf");
  // Updates sorted chronologically.
  assert.deepEqual(view.updates.map((u) => u.id), ["u1", "u2"]);
  assert.equal(view.staged, true);
});

test("only the reports passed in (approved) are exposed", () => {
  // The caller is responsible for passing approved-only client views; the portal
  // never fetches or exposes non-approved reports itself.
  const view = buildClientPortalView({ project, approvedReports: [] });
  assert.deepEqual(view.reports, []);
});
