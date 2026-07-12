const ORGANIZATION_ROLE_SET = new Set([
  "platform_admin",
  "company_admin",
  "executive",
  "department_head",
  "supervisor",
  "employee",
  "finance_reviewer",
  "legal_reviewer",
  "compliance_reviewer",
  "external_collaborator",
  "read_only_auditor"
]);

const PROJECT_ROLE_SET = new Set([
  "project_executive",
  "project_manager",
  "design_manager",
  "bim_vdc_manager",
  "discipline_lead",
  "designer",
  "engineer",
  "coordinator",
  "document_controller",
  "permit_coordinator",
  "superintendent",
  "field_user",
  "cost_reviewer",
  "approver",
  "viewer"
]);

function assertRequiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

function assertStaged(input) {
  if (input?.staged !== true) {
    throw new Error("Synthetic staged entities must set staged=true.");
  }
}

export function createTenant(input) {
  assertRequiredString(input?.id, "Tenant id");
  assertRequiredString(input?.name, "Tenant name");
  assertStaged(input);

  return {
    id: input.id,
    name: input.name,
    staged: true,
    status: input.status ?? "active",
    createdAt: input.createdAt ?? new Date().toISOString()
  };
}

export function createBusinessUnit(input) {
  assertRequiredString(input?.id, "Business unit id");
  assertRequiredString(input?.tenantId, "Business unit tenantId");
  assertRequiredString(input?.name, "Business unit name");
  assertStaged(input);

  return {
    id: input.id,
    tenantId: input.tenantId,
    name: input.name,
    staged: true
  };
}

export function createDepartment(input) {
  assertRequiredString(input?.id, "Department id");
  assertRequiredString(input?.tenantId, "Department tenantId");
  assertRequiredString(input?.businessUnitId, "Department businessUnitId");
  assertRequiredString(input?.name, "Department name");
  assertStaged(input);

  return {
    id: input.id,
    tenantId: input.tenantId,
    businessUnitId: input.businessUnitId,
    name: input.name,
    code: input.code ?? null,
    staged: true
  };
}

export function createTeam(input) {
  assertRequiredString(input?.id, "Team id");
  assertRequiredString(input?.tenantId, "Team tenantId");
  assertRequiredString(input?.departmentId, "Team departmentId");
  assertRequiredString(input?.name, "Team name");
  assertStaged(input);

  return {
    id: input.id,
    tenantId: input.tenantId,
    departmentId: input.departmentId,
    name: input.name,
    staged: true
  };
}

export function createUser(input) {
  assertRequiredString(input?.id, "User id");
  assertRequiredString(input?.tenantId, "User tenantId");
  assertRequiredString(input?.email, "User email");
  assertRequiredString(input?.displayName, "User displayName");
  assertStaged(input);

  return {
    id: input.id,
    tenantId: input.tenantId,
    email: input.email,
    displayName: input.displayName,
    staged: true,
    status: input.status ?? "active"
  };
}

export function createMembership(input) {
  assertRequiredString(input?.id, "Membership id");
  assertRequiredString(input?.tenantId, "Membership tenantId");
  assertRequiredString(input?.userId, "Membership userId");
  assertRequiredString(input?.departmentId, "Membership departmentId");
  assertRequiredString(input?.teamId, "Membership teamId");
  assertStaged(input);

  if (!ORGANIZATION_ROLE_SET.has(input.organizationRole)) {
    throw new Error(`Unknown organization role: ${input.organizationRole}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    userId: input.userId,
    departmentId: input.departmentId,
    teamId: input.teamId,
    organizationRole: input.organizationRole,
    staged: true
  };
}

export function createProject(input) {
  assertRequiredString(input?.id, "Project id");
  assertRequiredString(input?.tenantId, "Project tenantId");
  assertRequiredString(input?.name, "Project name");
  assertStaged(input);

  return {
    id: input.id,
    tenantId: input.tenantId,
    name: input.name,
    projectType: input.projectType ?? "commercial",
    status: input.status ?? "draft",
    staged: true
  };
}

export function createProjectParticipant(input) {
  assertRequiredString(input?.id, "Project participant id");
  assertRequiredString(input?.tenantId, "Project participant tenantId");
  assertRequiredString(input?.projectId, "Project participant projectId");
  assertRequiredString(input?.userId, "Project participant userId");
  assertStaged(input);

  if (!PROJECT_ROLE_SET.has(input.projectRole)) {
    throw new Error(`Unknown project role: ${input.projectRole}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    userId: input.userId,
    projectRole: input.projectRole,
    staged: true
  };
}

export function assertSameTenant(...records) {
  const tenantIds = new Set(records.filter(Boolean).map((record) => record.tenantId ?? record.id));

  if (tenantIds.size > 1) {
    throw new Error("Cross-tenant combination rejected.");
  }
}

export function getFoundationRoleCatalog() {
  return {
    organizationRoles: Array.from(ORGANIZATION_ROLE_SET),
    projectRoles: Array.from(PROJECT_ROLE_SET)
  };
}
