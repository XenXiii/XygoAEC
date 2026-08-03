import crypto from "node:crypto";

import {
  createProject,
  createTenant,
  createUser
} from "../../shared-contracts/src/foundation.js";
import { generatePlatformBlueprint } from "../../platform-blueprint/src/index.js";

const PAID_ROLES = new Set(["xygo_admin", "client_owner", "client_staff", "client_viewer"]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function assertSlug(value) {
  const slug = requiredString(value, "Tenant slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Tenant slug must contain lowercase letters, numbers, and single hyphens only.");
  }
  return slug;
}

function normalizeUsers(users) {
  if (!Array.isArray(users) || users.length === 0) {
    throw new Error("At least one user is required.");
  }
  const normalized = users.map((user, index) => {
    const email = requiredString(user?.email, `User ${index + 1} email`).toLowerCase();
    const displayName = requiredString(user?.displayName, `User ${index + 1} displayName`);
    const role = requiredString(user?.role, `User ${index + 1} role`);
    if (!PAID_ROLES.has(role)) throw new Error(`Unknown paid-client role: ${role}`);
    const normalizedUser = { email, displayName, role };
    if (user?.oidcSubject !== undefined && user?.oidcSubject !== null) {
      normalizedUser.oidcSubject = requiredString(user.oidcSubject, `User ${index + 1} oidcSubject`);
    }
    return normalizedUser;
  });
  if (!normalized.some((user) => user.role === "client_owner")) {
    throw new Error("At least one client_owner is required.");
  }
  if (new Set(normalized.map((user) => user.email)).size !== normalized.length) {
    throw new Error("User emails must be unique within a tenant.");
  }
  const oidcSubjects = normalized.flatMap((user) => user.oidcSubject ? [user.oidcSubject] : []);
  if (new Set(oidcSubjects).size !== oidcSubjects.length) {
    throw new Error("OIDC subjects must be unique within a tenant.");
  }
  return normalized.sort((a, b) => a.email.localeCompare(b.email));
}

export function normalizeProvisioningInput(input) {
  if (input?.staged !== true) throw new Error("Provisioning requires staged=true.");
  const users = normalizeUsers(input.users);
  const config = {
    slug: assertSlug(input.slug),
    businessName: requiredString(input.businessName, "Business name"),
    projectName: requiredString(input.projectName, "Project name"),
    brandName: requiredString(input.brandName ?? input.businessName, "Brand name"),
    primaryColor: input.primaryColor ?? "#17324d",
    users
  };
  if (input.oidcIssuer !== undefined && input.oidcIssuer !== null) {
    config.oidcIssuer = requiredString(input.oidcIssuer, "OIDC issuer");
  }
  if (users.some((user) => user.oidcSubject) && !config.oidcIssuer) {
    throw new Error("OIDC issuer is required when a user has an oidcSubject.");
  }
  return config;
}

export function buildStagedTenantProvisioning(input, { now = () => new Date().toISOString() } = {}) {
  const config = normalizeProvisioningInput(input);
  const tenantId = `tenant-${config.slug}`;
  const createdAt = now();
  const provisioningKey = crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
  const tenant = createTenant({ id: tenantId, name: config.businessName, staged: true, createdAt });
  const users = config.users.map((user, index) => createUser({
    id: `${tenantId}-user-${index + 1}`,
    tenantId,
    email: user.email,
    displayName: user.displayName,
    staged: true
  }));
  const roleAssignments = users.map((user, index) => ({
    id: `${tenantId}-role-${index + 1}`,
    tenantId,
    userId: user.id,
    role: config.users[index].role,
    staged: true
  }));
  const oidcIdentities = users.flatMap((user, index) => {
    const subject = config.users[index].oidcSubject;
    if (!subject) return [];
    return [{
      id: `${tenantId}-oidc-${index + 1}`,
      tenantId,
      userId: user.id,
      issuer: config.oidcIssuer,
      subject,
      staged: true
    }];
  });
  const businessProfile = {
    id: `${tenantId}-business-profile`, tenantId, legalName: config.businessName,
    serviceLine: "Contractor Field Reports + Client Portal", staged: true
  };
  const project = createProject({
    id: `${tenantId}-project-1`, tenantId, name: config.projectName,
    projectType: "commercial", status: "draft", staged: true
  });
  const blueprint = generatePlatformBlueprint({
    id: `${tenantId}-blueprint-1`, tenantId, businessName: config.businessName,
    industry: "construction", serviceLine: businessProfile.serviceLine,
    roles: config.users.map((user) => user.role),
    workflows: ["field report capture", "human review", "share reports"],
    painPoints: ["manual field report compilation", "client status updates"],
    portalRequirements: ["approved reports only", "branded client portal"],
    dashboardRequirements: ["report status"], aiAgentRequirements: [],
    documentReportingNeeds: ["daily field reports"], integrationNeeds: [],
    selectedModules: ["field_reporting", "client_portal"], staged: true
  });
  const portalConfiguration = {
    id: `${tenantId}-portal-config`, tenantId, brandName: config.brandName,
    primaryColor: config.primaryColor, approvedContentOnly: true, staged: true
  };
  const portalData = {
    id: `${tenantId}-portal-starter`, tenantId, projectId: project.id,
    welcomeMessage: `Welcome to the ${config.brandName} project portal.`,
    approvedReports: [],
    updates: [{
      id: `${tenantId}-portal-update-1`,
      at: createdAt,
      message: `${config.brandName} staged portal provisioned.`
    }],
    staged: true
  };
  const provisioningEvent = {
    id: `${tenantId}-provisioned`, tenantId, action: "staged_tenant.provisioned",
    createdAt, staged: true
  };

  return {
    config, provisioningKey, tenant, users, roleAssignments, oidcIdentities, businessProfile,
    project, blueprint, portalConfiguration, portalData, provisioningEvent
  };
}
