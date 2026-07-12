import test from "node:test";
import assert from "node:assert/strict";

import {
  assertProjectAccess,
  assertSessionTenantAccess,
  buildAuthContext,
  createSyntheticSession
} from "../src/synthetic-auth.js";

test("synthetic sessions require staged mode", () => {
  assert.throws(
    () => createSyntheticSession({ sessionId: "s1", tenantId: "t1", userId: "u1" }),
    /staged=true/
  );
});

test("tenant access checks deny mismatched tenants", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    staged: true
  });

  assert.throws(() => assertSessionTenantAccess(session, "tenant-b"), /Tenant access denied/);
});

test("project access checks deny missing project scope", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });

  assert.throws(() => assertProjectAccess(session, "project-b"), /Project access denied/);
});

test("auth context is derived from the staged session", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    organizationRole: "executive",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const context = buildAuthContext(session);

  assert.equal(context.actorId, "user-a");
  assert.equal(context.organizationRole, "executive");
  assert.equal(context.staged, true);
});
