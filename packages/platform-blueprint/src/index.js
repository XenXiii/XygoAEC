// Xygo 2.0 — Business Platform Blueprint domain.
//
// Captures how an SMB operates (industry, roles, workflows, pain points, portal /
// dashboard / AI-agent / reporting / integration needs) and DETERMINISTICALLY
// generates a platform blueprint: recommended reusable modules + specs + ordered
// build steps + a summary. No live AI call — generation is pure and reproducible.

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

// --- Supported verticals (first wedge) ---------------------------------------
export const INDUSTRY_SET = new Set([
  "construction",
  "field_services",
  "inspections",
  "engineering",
  "home_services",
  "other"
]);

// --- Reusable module library -------------------------------------------------
// Each module names the business process it replaces/accelerates (Strategic Rule).
export const MODULE_LIBRARY = [
  { key: "client_portal", name: "Client Portal", category: "customer_experience", replaces: "email/phone status updates" },
  { key: "scheduling", name: "Scheduling & Booking", category: "operations", replaces: "manual calendar coordination" },
  { key: "crm_intake", name: "CRM / Lead Intake", category: "sales", replaces: "spreadsheet lead tracking" },
  { key: "field_reporting", name: "Field Reporting", category: "operations", replaces: "paper/photo field notes" },
  { key: "document_analysis", name: "Document Analysis", category: "knowledge", replaces: "manual document review" },
  { key: "compliance_review", name: "Compliance / Insurance Review", category: "risk", replaces: "manual compliance checks" },
  { key: "permitting", name: "Permitting", category: "operations", replaces: "manual permit package prep" },
  { key: "accounting_job_costing", name: "Accounting / Job Costing Dashboard", category: "finance", replaces: "spreadsheet job costing" },
  { key: "ai_receptionist", name: "AI Receptionist", category: "ai_agent", replaces: "missed calls and manual intake" },
  { key: "ai_project_coordinator", name: "AI Project Coordinator", category: "ai_agent", replaces: "manual status chasing" },
  { key: "reporting_dashboard", name: "Reporting Dashboard", category: "analytics", replaces: "manual report compilation" }
];

const MODULE_BY_KEY = new Map(MODULE_LIBRARY.map((module) => [module.key, module]));

// Keyword → module rules. Deterministic: any intake text containing a trigger
// recommends the module, with the trigger recorded as the rationale.
const MODULE_RULES = [
  { key: "field_reporting", triggers: ["field report", "field data", "photo", "job site", "inspection report", "daily log"] },
  { key: "client_portal", triggers: ["client portal", "customer portal", "client visibility", "status update", "share reports"] },
  { key: "scheduling", triggers: ["schedule", "booking", "dispatch", "appointment", "calendar"] },
  { key: "crm_intake", triggers: ["lead", "intake", "crm", "estimate request", "new inquiry"] },
  { key: "document_analysis", triggers: ["document", "spec", "drawing", "contract", "submittal", "pdf"] },
  { key: "compliance_review", triggers: ["compliance", "insurance", "coi", "safety", "osha", "certification"] },
  { key: "permitting", triggers: ["permit", "jurisdiction", "ahj", "code review"] },
  { key: "accounting_job_costing", triggers: ["job cost", "invoic", "accounting", "budget", "margin", "billing"] },
  { key: "ai_receptionist", triggers: ["receptionist", "answer calls", "phone intake", "after hours"] },
  { key: "ai_project_coordinator", triggers: ["coordinat", "status chasing", "follow up", "project manager assist"] },
  { key: "reporting_dashboard", triggers: ["report", "dashboard", "kpi", "metrics", "analytics"] }
];

// Industry defaults ensure a useful baseline even with sparse intake.
const INDUSTRY_DEFAULT_MODULES = {
  construction: ["field_reporting", "client_portal", "document_analysis", "reporting_dashboard"],
  field_services: ["scheduling", "field_reporting", "client_portal", "crm_intake"],
  inspections: ["field_reporting", "document_analysis", "compliance_review", "client_portal"],
  engineering: ["document_analysis", "reporting_dashboard", "client_portal"],
  home_services: ["scheduling", "crm_intake", "client_portal", "ai_receptionist"],
  other: ["client_portal", "reporting_dashboard"]
};

export function createBlueprintIntake(input) {
  requiredString(input?.id, "Blueprint id");
  requiredString(input?.tenantId, "Blueprint tenantId");
  requiredString(input?.businessName, "Business name");
  requiredString(input?.industry, "Industry");

  if (!INDUSTRY_SET.has(input.industry)) {
    throw new Error(`Unknown industry: ${input.industry}`);
  }

  if (input.staged !== true) {
    throw new Error("Blueprint intake must be staged.");
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    businessName: input.businessName,
    industry: input.industry,
    serviceLine: input.serviceLine ?? null,
    roles: toArray(input.roles),
    workflows: toArray(input.workflows),
    painPoints: toArray(input.painPoints),
    portalRequirements: toArray(input.portalRequirements),
    dashboardRequirements: toArray(input.dashboardRequirements),
    aiAgentRequirements: toArray(input.aiAgentRequirements),
    documentReportingNeeds: toArray(input.documentReportingNeeds),
    integrationNeeds: toArray(input.integrationNeeds),
    selectedModules: toArray(input.selectedModules),
    staged: true
  };
}

function haystack(intake) {
  return [
    intake.serviceLine ?? "",
    ...intake.workflows,
    ...intake.painPoints,
    ...intake.portalRequirements,
    ...intake.dashboardRequirements,
    ...intake.aiAgentRequirements,
    ...intake.documentReportingNeeds,
    ...intake.integrationNeeds
  ]
    .join(" \n ")
    .toLowerCase();
}

export function recommendModules(intake) {
  const text = haystack(intake);
  const recommendations = new Map();

  function add(key, rationale) {
    if (!MODULE_BY_KEY.has(key) || recommendations.has(key)) {
      return;
    }
    recommendations.set(key, { ...MODULE_BY_KEY.get(key), rationale });
  }

  // 1. Explicit selections win first.
  for (const key of intake.selectedModules) {
    add(key, "explicitly selected");
  }
  // 2. Keyword-triggered recommendations.
  for (const rule of MODULE_RULES) {
    const trigger = rule.triggers.find((t) => text.includes(t));
    if (trigger) {
      add(rule.key, `matched requirement: "${trigger}"`);
    }
  }
  // 3. Industry baseline fills gaps.
  for (const key of INDUSTRY_DEFAULT_MODULES[intake.industry] ?? []) {
    add(key, `${intake.industry} baseline`);
  }

  // Stable ordering by module-library order for determinism.
  return MODULE_LIBRARY.filter((module) => recommendations.has(module.key)).map((module) =>
    recommendations.get(module.key)
  );
}

export function generatePlatformBlueprint(intakeInput) {
  const intake = createBlueprintIntake(intakeInput);
  const modules = recommendModules(intake);
  const moduleKeys = modules.map((module) => module.key);

  const portalModules = modules.filter((module) => module.category === "customer_experience").map((m) => m.key);
  const aiAgents = modules.filter((module) => module.category === "ai_agent").map((m) => m.key);

  // Ordered build steps: foundation → operations modules → AI agents → dashboards → portal.
  const buildOrder = [
    "crm_intake",
    "scheduling",
    "field_reporting",
    "document_analysis",
    "permitting",
    "compliance_review",
    "accounting_job_costing",
    "ai_receptionist",
    "ai_project_coordinator",
    "reporting_dashboard",
    "client_portal"
  ];
  const nextBuildSteps = buildOrder
    .filter((key) => moduleKeys.includes(key))
    .map((key, index) => ({
      order: index + 1,
      module: key,
      action: `Provision staged ${MODULE_BY_KEY.get(key).name}`,
      replaces: MODULE_BY_KEY.get(key).replaces
    }));

  const summary =
    `Staged platform blueprint for ${intake.businessName} (${intake.industry}): ` +
    `${modules.length} recommended module(s) — ${modules.map((m) => m.name).join(", ")}. ` +
    `${nextBuildSteps.length} build step(s) planned. SIMULATED — no live deployment.`;

  return {
    id: intake.id,
    blueprintId: intake.id,
    tenantId: intake.tenantId,
    businessName: intake.businessName,
    industry: intake.industry,
    intake,
    recommendedModules: modules,
    portalSpec: {
      modules: portalModules,
      requirements: intake.portalRequirements,
      branded: true
    },
    dashboardSpec: {
      widgets: intake.dashboardRequirements,
      includesReportingDashboard: moduleKeys.includes("reporting_dashboard")
    },
    aiAgentSpec: {
      agents: aiAgents,
      requirements: intake.aiAgentRequirements
    },
    reportingSpec: {
      needs: intake.documentReportingNeeds,
      includesDocumentAnalysis: moduleKeys.includes("document_analysis")
    },
    integrationSpec: {
      // Staged: requested integrations are recorded but never activated.
      requested: intake.integrationNeeds,
      status: "staged_mock_only"
    },
    nextBuildSteps,
    summary,
    staged: true
  };
}
