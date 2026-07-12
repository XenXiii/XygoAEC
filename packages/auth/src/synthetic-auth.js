function required(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

export function createSyntheticSession(input) {
  required(input?.sessionId, "sessionId");
  required(input?.tenantId, "tenantId");
  required(input?.userId, "userId");

  if (input?.staged !== true) {
    throw new Error("Synthetic sessions must be marked staged=true.");
  }

  return {
    sessionId: input.sessionId,
    tenantId: input.tenantId,
    userId: input.userId,
    organizationRole: input.organizationRole ?? "employee",
    projectRoles: input.projectRoles ?? [],
    allowedProjectIds: input.allowedProjectIds ?? [],
    staged: true
  };
}

export function assertSessionTenantAccess(session, tenantId) {
  if (!session || session.staged !== true) {
    throw new Error("A staged synthetic session is required.");
  }

  if (session.tenantId !== tenantId) {
    throw new Error("Tenant access denied.");
  }
}

export function assertProjectAccess(session, projectId) {
  if (!session.allowedProjectIds.includes(projectId)) {
    throw new Error("Project access denied.");
  }
}

export function buildAuthContext(session) {
  if (!session || session.staged !== true) {
    throw new Error("Cannot build auth context without a staged session.");
  }

  return {
    actorType: "user",
    actorId: session.userId,
    tenantId: session.tenantId,
    organizationRole: session.organizationRole,
    projectRoles: session.projectRoles,
    allowedProjectIds: session.allowedProjectIds,
    staged: true
  };
}
