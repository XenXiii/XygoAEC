import test from "node:test";
import assert from "node:assert/strict";

import {
  assertSameTenant,
  createDepartment,
  createMembership,
  createProject,
  createProjectParticipant,
  createTeam,
  createTenant,
  createUser,
  getFoundationRoleCatalog
} from "../src/foundation.js";

test("foundation entities require staged mode", () => {
  assert.throws(() => createTenant({ id: "tenant-a", name: "Tenant A" }), /staged=true/);
});

test("tenant and org records can be created with staged data", () => {
  const tenant = createTenant({ id: "tenant-a", name: "Tenant A", staged: true });
  const department = createDepartment({
    id: "dept-a",
    tenantId: tenant.id,
    businessUnitId: "bu-a",
    name: "Architecture",
    staged: true
  });
  const team = createTeam({
    id: "team-a",
    tenantId: tenant.id,
    departmentId: department.id,
    name: "Core Design",
    staged: true
  });

  assert.equal(tenant.staged, true);
  assert.equal(department.tenantId, tenant.id);
  assert.equal(team.departmentId, department.id);
});

test("membership rejects unknown roles", () => {
  assert.throws(
    () =>
      createMembership({
        id: "membership-a",
        tenantId: "tenant-a",
        userId: "user-a",
        departmentId: "dept-a",
        teamId: "team-a",
        organizationRole: "bossman",
        staged: true
      }),
    /Unknown organization role/
  );
});

test("project participants reject unknown project roles", () => {
  assert.throws(
    () =>
      createProjectParticipant({
        id: "participant-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        userId: "user-a",
        projectRole: "captain",
        staged: true
      }),
    /Unknown project role/
  );
});

test("same-tenant assertions reject mixed tenant records", () => {
  const userA = createUser({
    id: "user-a",
    tenantId: "tenant-a",
    email: "a@example.invalid",
    displayName: "User A",
    staged: true
  });
  const projectB = createProject({
    id: "project-b",
    tenantId: "tenant-b",
    name: "Project B",
    staged: true
  });

  assert.throws(() => assertSameTenant(userA, projectB), /Cross-tenant combination rejected/);
});

test("role catalog exposes organization and project role definitions", () => {
  const catalog = getFoundationRoleCatalog();

  assert.ok(catalog.organizationRoles.includes("executive"));
  assert.ok(catalog.projectRoles.includes("project_manager"));
});
