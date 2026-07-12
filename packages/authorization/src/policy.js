const ALLOW_MATRIX = [
  {
    resource: "tenant",
    action: "read",
    organizationRoles: ["platform_admin", "company_admin", "executive", "read_only_auditor"]
  },
  {
    resource: "department",
    action: "read",
    organizationRoles: ["platform_admin", "company_admin", "executive", "department_head", "supervisor"]
  },
  {
    resource: "project",
    action: "read",
    organizationRoles: ["platform_admin", "company_admin", "executive", "supervisor"],
    projectRoles: ["project_executive", "project_manager", "design_manager", "viewer"]
  },
  {
    resource: "project",
    action: "update",
    organizationRoles: ["platform_admin", "company_admin"],
    projectRoles: ["project_manager", "design_manager"]
  },
  {
    resource: "channel",
    action: "read",
    organizationRoles: ["platform_admin", "company_admin", "supervisor", "employee"],
    visibilityClasses: ["participant_only", "team_only", "department_only", "project_only", "company_public_summary"]
  },
  {
    resource: "announcement_channel",
    action: "publish",
    organizationRoles: ["platform_admin", "company_admin", "executive"]
  }
];

export function canPerform(input) {
  const rule = ALLOW_MATRIX.find(
    (candidate) => candidate.resource === input.resource && candidate.action === input.action
  );

  if (!rule) {
    return {
      allowed: false,
      reason: "default_deny_no_matching_rule"
    };
  }

  if (input.tenantId !== input.resourceTenantId) {
    return {
      allowed: false,
      reason: "tenant_mismatch"
    };
  }

  if (rule.visibilityClasses && !rule.visibilityClasses.includes(input.visibilityClass)) {
    return {
      allowed: false,
      reason: "visibility_class_denied"
    };
  }

  const organizationAllowed =
    rule.organizationRoles?.includes(input.organizationRole) === true;
  const projectAllowed =
    input.projectRole && rule.projectRoles?.includes(input.projectRole) === true;

  if (!organizationAllowed && !projectAllowed) {
    return {
      allowed: false,
      reason: "role_denied"
    };
  }

  return {
    allowed: true,
    reason: "allowed"
  };
}

export function getPermissionMatrix() {
  return ALLOW_MATRIX.map((rule) => ({ ...rule }));
}
