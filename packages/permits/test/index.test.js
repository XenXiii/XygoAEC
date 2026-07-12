import test from "node:test";
import assert from "node:assert/strict";

import { createSyntheticSession } from "../../auth/src/synthetic-auth.js";
import { createPermitPackage, transitionPermitPackage } from "../src/index.js";

test("permit packages reject unknown states", () => {
  assert.throws(
    () =>
      createPermitPackage({
        id: "permit-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        jurisdictionProfile: "sample-jurisdiction",
        status: "live_submitted"
      }),
    /Unknown permit status/
  );
});

test("permit package blocks readiness without completed forms", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const permitPackage = createPermitPackage({
    id: "permit-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    jurisdictionProfile: "sample-jurisdiction",
    status: "internal_completeness_review",
    requiredFormsChecklist: [true, false]
  });

  assert.throws(
    () =>
      transitionPermitPackage({
        session,
        permitPackage,
        nextStatus: "ready_for_submission"
      }),
    /required forms incomplete/
  );
});

test("permit transitions increment simulated submission cycles", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const permitPackage = createPermitPackage({
    id: "permit-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    jurisdictionProfile: "sample-jurisdiction",
    status: "ready_for_submission",
    submissionPackageRefs: ["drawing:sheet-a"],
    requiredFormsChecklist: [true, true]
  });
  const result = transitionPermitPackage({
    session,
    permitPackage,
    nextStatus: "simulated_submitted"
  });

  assert.equal(result.permitPackage.submissionCycles, 1);
  assert.equal(result.auditEvent.action, "permit.lifecycle.transitioned");
});
