import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { provisionStagedTenant, readProvisioningStore } from "../src/provision-tenant.js";

function input(slug, email) {
  return {
    staged: true, slug, businessName: `${slug} Contracting`, projectName: `${slug} Starter Project`,
    users: [{ email, displayName: `${slug} Owner`, role: "client_owner" }]
  };
}

test("staged tenant provisioning is idempotent", () => {
  const storePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "xygo-provision-")), "store.json");
  const now = () => "2026-08-02T00:00:00.000Z";
  const first = provisionStagedTenant({ storePath, input: input("alpha", "owner@alpha.invalid"), now });
  const second = provisionStagedTenant({ storePath, input: input("alpha", "owner@alpha.invalid"), now });
  const state = readProvisioningStore(storePath);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(state.tenants.filter((item) => item.id === "tenant-alpha").length, 1);
  assert.equal(state.projects.filter((item) => item.tenantId === "tenant-alpha").length, 1);
  assert.equal(state.provisioningEvents.filter((item) => item.tenantId === "tenant-alpha").length, 1);
});

test("provisioning a second tenant keeps every record tenant-isolated", () => {
  const storePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "xygo-provision-")), "store.json");
  provisionStagedTenant({ storePath, input: input("alpha", "owner@alpha.invalid") });
  provisionStagedTenant({ storePath, input: input("bravo", "owner@bravo.invalid") });
  const state = readProvisioningStore(storePath);

  for (const collection of ["users", "roleAssignments", "businessProfiles", "projects", "platformBlueprints", "portalConfigurations", "portalData"]) {
    const alpha = state[collection].filter((item) => item.tenantId === "tenant-alpha");
    const bravo = state[collection].filter((item) => item.tenantId === "tenant-bravo");
    assert.ok(alpha.length > 0, `${collection} has alpha records`);
    assert.ok(bravo.length > 0, `${collection} has bravo records`);
    assert.equal(alpha.some((item) => item.tenantId === "tenant-bravo"), false);
    assert.equal(bravo.some((item) => item.tenantId === "tenant-alpha"), false);
  }
});

test("an existing slug cannot be silently reprovisioned with different input", () => {
  const storePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "xygo-provision-")), "store.json");
  provisionStagedTenant({ storePath, input: input("alpha", "owner@alpha.invalid") });
  assert.throws(
    () => provisionStagedTenant({ storePath, input: input("alpha", "different@alpha.invalid") }),
    /different provisioning input/
  );
});
