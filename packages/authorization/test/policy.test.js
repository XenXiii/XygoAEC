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

test("permission matrix is machine-readable", () => {
  const matrix = getPermissionMatrix();
  assert.ok(matrix.some((rule) => rule.resource === "announcement_channel"));
});
