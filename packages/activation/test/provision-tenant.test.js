import assert from "node:assert/strict";
import test from "node:test";

import { runPostgresTransaction } from "../../../apps/api/src/repositories/postgres.js";
import { buildStagedTenantProvisioning, normalizeProvisioningInput } from "../src/provision-tenant.js";

function input(slug = "alpha") {
  return {
    staged: true,
    slug,
    businessName: `${slug} Contracting`,
    projectName: `${slug} Starter Project`,
    users: [
      { email: `staff@${slug}.invalid`, displayName: `${slug} Staff`, role: "client_staff" },
      { email: `owner@${slug}.invalid`, displayName: `${slug} Owner`, role: "client_owner" }
    ]
  };
}

test("provisioning records use deterministic canonical ids and tenant scope", () => {
  const records = buildStagedTenantProvisioning(input(), {
    now: () => "2026-08-02T00:00:00.000Z"
  });

  assert.equal(records.tenant.id, "tenant-alpha");
  assert.equal(records.project.id, "tenant-alpha-project-1");
  assert.equal(records.blueprint.tenantId, "tenant-alpha");
  assert.equal(records.portalConfiguration.approvedContentOnly, true);
  assert.equal(records.portalData.updates[0].message, "alpha Contracting staged portal provisioned.");
  assert.deepEqual(records.roleAssignments.map((item) => item.role), ["client_owner", "client_staff"]);
  assert.ok(records.users.every((item) => item.tenantId === "tenant-alpha"));
  assert.equal(records.provisioningEvent.action, "staged_tenant.provisioned");
});

test("canonical provisioning input is stable across user order", () => {
  const original = input();
  const reversed = { ...original, users: [...original.users].reverse() };
  assert.deepEqual(normalizeProvisioningInput(original), normalizeProvisioningInput(reversed));
});

test("provisioning remains staged-only and requires an owner", () => {
  assert.throws(() => normalizeProvisioningInput({ ...input(), staged: false }), /staged=true/);
  assert.throws(
    () => normalizeProvisioningInput({ ...input(), users: [{ email: "staff@alpha.invalid", displayName: "Staff", role: "client_staff" }] }),
    /client_owner/
  );
});

test("postgres transaction commits on success", async () => {
  const statements = [];
  const client = {
    query: async (text) => statements.push(text),
    release: () => statements.push("RELEASE")
  };
  const result = await runPostgresTransaction({ connect: async () => client }, async (transaction) => {
    await transaction.query("INSERT TEST RECORD");
    return "ok";
  });

  assert.equal(result, "ok");
  assert.deepEqual(statements, ["BEGIN", "INSERT TEST RECORD", "COMMIT", "RELEASE"]);
});

test("postgres transaction rolls back and releases on an error", async () => {
  const statements = [];
  const client = {
    query: async (text) => statements.push(text),
    release: () => statements.push("RELEASE")
  };
  await assert.rejects(
    () => runPostgresTransaction({ connect: async () => client }, async (transaction) => {
      await transaction.query("INSERT PARTIAL RECORD");
      throw new Error("forced provisioning failure");
    }),
    /forced provisioning failure/
  );
  assert.deepEqual(statements, ["BEGIN", "INSERT PARTIAL RECORD", "ROLLBACK", "RELEASE"]);
});
