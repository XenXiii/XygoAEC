import test from "node:test";
import assert from "node:assert/strict";

import { canPerform, getPermissionMatrix } from "../src/policy.js";

test("authorization defaults to deny when no rule matches", () => {
  const result = canPerform({
    tenantId: "tenant-a",
    resourceTenantId: "tenant-a",
    organizationRole: "employee",
    resource: "secret_panel",
    action: "read"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "default_deny_no_matching_rule");
});

test("authorization denies cross-tenant access", () => {
  const result = canPerform({
    tenantId: "tenant-a",
    resourceTenantId: "tenant-b",
    organizationRole: "company_admin",
    resource: "tenant",
    action: "read"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "tenant_mismatch");
});

test("authorization allows project managers to update projects in-tenant", () => {
  const result = canPerform({
    tenantId: "tenant-a",
    resourceTenantId: "tenant-a",
    organizationRole: "employee",
    projectRole: "project_manager",
    resource: "project",
    action: "update"
  });

  assert.equal(result.allowed, true);
});

test("authorization denies disallowed visibility classes", () => {
  const result = canPerform({
    tenantId: "tenant-a",
    resourceTenantId: "tenant-a",
    organizationRole: "employee",
    resource: "channel",
    action: "read",
    visibilityClass: "legal_restricted"
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "visibility_class_denied");
});

test("paid-client roles enforce owner, staff, and viewer permissions", () => {
  const decision = (organizationRole, resource, action) => canPerform({
    tenantId: "tenant-a",
    resourceTenantId: "tenant-a",
    organizationRole,
    resource,
    action
  });

  assert.equal(decision("xygo_admin", "field_report", "update").allowed, true);
  assert.equal(decision("xygo_admin", "project", "create").allowed, true);
  assert.equal(decision("xygo_admin", "client_portal", "read").allowed, true);
  assert.equal(decision("client_owner", "field_report", "update").allowed, true);
  assert.equal(decision("client_owner", "project", "create").allowed, true);
  assert.equal(decision("client_owner", "client_portal", "read").allowed, true);
  assert.equal(decision("client_staff", "field_report", "create").allowed, true);
  assert.equal(decision("client_staff", "field_report", "update").allowed, true);
  assert.equal(decision("client_staff", "client_portal", "read").allowed, true);
  assert.equal(decision("client_staff", "project", "create").allowed, false);
  assert.equal(decision("client_staff", "coordination_issue", "create").allowed, false);
  assert.equal(decision("client_viewer", "project", "read").allowed, true);
  assert.equal(decision("client_viewer", "client_portal", "read").allowed, true);
  assert.equal(decision("client_viewer", "field_report", "read").allowed, false);
  assert.equal(decision("client_viewer", "field_report", "create").allowed, false);
  assert.equal(decision("client_viewer", "field_report", "update").allowed, false);

  for (const organizationRole of ["xygo_admin", "client_owner", "client_staff", "client_viewer"]) {
    const crossTenant = canPerform({
      tenantId: "tenant-a",
      resourceTenantId: "tenant-b",
      organizationRole,
      resource: "client_portal",
      action: "read"
    });
    assert.equal(crossTenant.allowed, false);
    assert.equal(crossTenant.reason, "tenant_mismatch");
  }
});

test("permission matrix is machine-readable", () => {
  const matrix = getPermissionMatrix();
  assert.ok(matrix.some((rule) => rule.resource === "announcement_channel"));
});
