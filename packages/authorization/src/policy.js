const ORGANIZATION_ROLE_ALIASES = {
  xygo_admin: "platform_admin",
  client_owner: "company_admin"
};

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
    organizationRoles: [
      "platform_admin",
      "company_admin",
      "executive",
      "supervisor",
      "read_only_auditor",
      "client_staff",
      "client_viewer"
    ],
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
  },
  // --- API resource rules (Phase 1 trust layer) ---
  // Reads: broad in-tenant visibility for admin/exec/audit/supervisor roles, plus project roles.
  // Writes: restricted to admin org roles or delivery project roles. All rules still enforce
  // tenantId === resourceTenantId via canPerform's cross-tenant guard.
  // "project"/"read" already has a dedicated rule above; do not duplicate it here.
  ...[
    "coordination_issue",
    "rfi",
    "permit_package",
    "review_session",
    "ai_review_run",
    "ai_finding",
    "executive_dashboard",
    "audit_event",
    "transfer",
    "platform_blueprint",
    "field_report",
    "file_record",
    "email_delivery",
    "client_portal"
  ].map((resource) => ({
    resource,
    action: "read",
    organizationRoles: [
      "platform_admin",
      "company_admin",
      "executive",
      "supervisor",
      "read_only_auditor",
      ...(resource === "field_report" ? ["client_staff"] : []),
      ...(resource === "file_record" ? ["client_staff", "client_viewer"] : []),
      ...(resource === "client_portal" ? ["client_staff", "client_viewer"] : [])
    ],
    projectRoles: ["project_executive", "project_manager", "design_manager", "viewer"]
  })),
  ...["coordination_issue", "rfi", "permit_package", "review_session", "ai_review_run", "ai_finding", "platform_blueprint", "field_report", "file_record"].map(
    (resource) => ({
      resource,
      action: "create",
      organizationRoles: [
        "platform_admin",
        "company_admin",
        ...(["field_report", "file_record"].includes(resource) ? ["client_staff"] : [])
      ],
      projectRoles: ["project_manager", "design_manager"]
    })
  ),
  {
    resource: "field_report",
    action: "update",
    organizationRoles: ["platform_admin", "company_admin", "client_staff"],
    projectRoles: ["project_manager", "design_manager"]
  },
  {
    resource: "file_record",
    action: "update",
    organizationRoles: ["platform_admin", "company_admin", "client_staff"],
    projectRoles: ["project_manager", "design_manager"]
  },
  {
    resource: "file_record",
    action: "delete",
    organizationRoles: ["platform_admin", "company_admin", "client_staff"],
    projectRoles: ["project_manager", "design_manager"]
  },
  {
    resource: "project",
    action: "create",
    organizationRoles: ["platform_admin", "company_admin"]
  },
  {
    resource: "ai_finding",
    action: "update",
    organizationRoles: ["platform_admin", "company_admin"],
    projectRoles: ["project_manager", "design_manager"]
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

  const organizationRole = ORGANIZATION_ROLE_ALIASES[input.organizationRole] ?? input.organizationRole;
  const organizationAllowed =
    rule.organizationRoles?.includes(organizationRole) === true;
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
