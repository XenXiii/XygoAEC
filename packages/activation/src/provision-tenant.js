import fs from "node:fs";
import path from "node:path";

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

function initialState() {
  return {
    schemaVersion: 1,
    tenants: [],
    users: [],
    roleAssignments: [],
    businessProfiles: [],
    projects: [],
    platformBlueprints: [],
    portalConfigurations: [],
    portalData: [],
    provisioningEvents: []
  };
}

function readState(storePath) {
  if (!fs.existsSync(storePath)) return initialState();
  const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
  return { ...initialState(), ...parsed };
}

function writeState(storePath, state) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const temporaryPath = `${storePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, storePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
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
    return { email, displayName, role };
  });
  if (!normalized.some((user) => user.role === "client_owner")) {
    throw new Error("At least one client_owner is required.");
  }
  if (new Set(normalized.map((user) => user.email)).size !== normalized.length) {
    throw new Error("User emails must be unique within a tenant.");
  }
  return normalized.sort((a, b) => a.email.localeCompare(b.email));
}

function canonicalInput(input) {
  if (input?.staged !== true) throw new Error("Provisioning requires staged=true.");
  return {
    slug: assertSlug(input.slug),
    businessName: requiredString(input.businessName, "Business name"),
    projectName: requiredString(input.projectName, "Project name"),
    brandName: requiredString(input.brandName ?? input.businessName, "Brand name"),
    primaryColor: input.primaryColor ?? "#17324d",
    users: normalizeUsers(input.users)
  };
}

function tenantRecords(state, tenantId) {
  const scoped = (key) => state[key].filter((item) => item.tenantId === tenantId);
  return {
    tenant: state.tenants.find((item) => item.id === tenantId),
    users: scoped("users"),
    roleAssignments: scoped("roleAssignments"),
    businessProfile: scoped("businessProfiles")[0],
    project: scoped("projects")[0],
    blueprint: scoped("platformBlueprints")[0],
    portalConfiguration: scoped("portalConfigurations")[0],
    portalData: scoped("portalData")[0]
  };
}

export function provisionStagedTenant({ storePath, input, now = () => new Date().toISOString() }) {
  requiredString(storePath, "Provisioning store path");
  const config = canonicalInput(input);
  const tenantId = `tenant-${config.slug}`;
  const state = readState(storePath);
  const existing = state.tenants.find((tenant) => tenant.id === tenantId);

  if (existing) {
    if (existing.provisioningKey !== JSON.stringify(config)) {
      throw new Error(`Tenant ${tenantId} already exists with different provisioning input.`);
    }
    return { created: false, ...tenantRecords(state, tenantId) };
  }

  const createdAt = now();
  const tenant = {
    ...createTenant({ id: tenantId, name: config.businessName, staged: true, createdAt }),
    provisioningKey: JSON.stringify(config)
  };
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
    approvedReports: [], staged: true
  };

  state.tenants.push(tenant);
  state.users.push(...users);
  state.roleAssignments.push(...roleAssignments);
  state.businessProfiles.push(businessProfile);
  state.projects.push(project);
  state.platformBlueprints.push(blueprint);
  state.portalConfigurations.push(portalConfiguration);
  state.portalData.push(portalData);
  state.provisioningEvents.push({
    id: `${tenantId}-provisioned`, tenantId, action: "staged_tenant.provisioned",
    createdAt, staged: true
  });
  writeState(storePath, state);

  return { created: true, tenant, users, roleAssignments, businessProfile, project, blueprint, portalConfiguration, portalData };
}

export function readProvisioningStore(storePath) {
  return readState(storePath);
}
