import test from "node:test";
import assert from "node:assert/strict";

import {
  INDUSTRY_SET,
  MODULE_LIBRARY,
  createBlueprintIntake,
  generatePlatformBlueprint,
  recommendModules
} from "../src/index.js";

function intake(overrides = {}) {
  return {
    id: "bp-1",
    tenantId: "tenant-commercial-sim",
    businessName: "Acme Builders",
    industry: "construction",
    staged: true,
    ...overrides
  };
}

test("intake requires core fields and staged flag", () => {
  assert.throws(() => createBlueprintIntake({ id: "x", tenantId: "t", businessName: "b", industry: "construction" }), /staged/);
  assert.throws(() => createBlueprintIntake(intake({ businessName: "" })), /Business name/);
  assert.throws(() => createBlueprintIntake(intake({ industry: "aerospace" })), /Unknown industry/);
});

test("module library keys are unique and industries are covered", () => {
  const keys = MODULE_LIBRARY.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(INDUSTRY_SET.has("construction"));
});

test("keyword requirements recommend matching modules with rationale", () => {
  const modules = recommendModules(
    createBlueprintIntake(
      intake({
        painPoints: ["Too much manual field report writing"],
        aiAgentRequirements: ["AI receptionist to answer calls"]
      })
    )
  );
  const byKey = new Map(modules.map((m) => [m.key, m]));
  assert.ok(byKey.has("field_reporting"));
  assert.match(byKey.get("field_reporting").rationale, /field report/);
  assert.ok(byKey.has("ai_receptionist"));
});

test("explicit selections are always included", () => {
  const modules = recommendModules(createBlueprintIntake(intake({ selectedModules: ["permitting"] })));
  assert.ok(modules.some((m) => m.key === "permitting" && m.rationale === "explicitly selected"));
});

test("generation is deterministic for identical input", () => {
  const a = generatePlatformBlueprint(intake({ workflows: ["scheduling", "field reports"] }));
  const b = generatePlatformBlueprint(intake({ workflows: ["scheduling", "field reports"] }));
  assert.deepEqual(a, b);
});

test("blueprint includes specs, ordered build steps, and a staged summary", () => {
  const bp = generatePlatformBlueprint(
    intake({
      industry: "field_services",
      portalRequirements: ["client status portal"],
      dashboardRequirements: ["revenue kpi"],
      aiAgentRequirements: ["AI project coordinator"],
      integrationNeeds: ["QuickBooks"]
    })
  );

  assert.ok(bp.recommendedModules.length > 0);
  assert.ok(bp.nextBuildSteps.length > 0);
  // Build steps are ordered and client_portal comes last when present.
  const orders = bp.nextBuildSteps.map((s) => s.order);
  assert.deepEqual(orders, [...orders].sort((x, y) => x - y));
  if (bp.nextBuildSteps.some((s) => s.module === "client_portal")) {
    assert.equal(bp.nextBuildSteps[bp.nextBuildSteps.length - 1].module, "client_portal");
  }
  // Integrations recorded but never activated (staged guardrail).
  assert.equal(bp.integrationSpec.status, "staged_mock_only");
  assert.deepEqual(bp.integrationSpec.requested, ["QuickBooks"]);
  assert.equal(bp.staged, true);
  assert.match(bp.summary, /SIMULATED/);
});

test("industry baseline recommends modules even with sparse intake", () => {
  const bp = generatePlatformBlueprint(intake({ industry: "home_services" }));
  const keys = bp.recommendedModules.map((m) => m.key);
  assert.ok(keys.includes("scheduling"));
  assert.ok(keys.includes("client_portal"));
});
