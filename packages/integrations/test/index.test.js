import test from "node:test";
import assert from "node:assert/strict";

import { createSyntheticSession } from "../../auth/src/synthetic-auth.js";
import {
  createTransferPackage,
  emitTransferAudit,
  getProviderAdapters,
  simulateTransferPipeline
} from "../src/index.js";

test("transfer packages reject unknown providers", () => {
  assert.throws(
    () =>
      createTransferPackage({
        id: "transfer-a",
        tenantId: "tenant-a",
        projectId: "project-a",
        destinationProvider: "oracle_mars",
        sheetManifest: [],
        modelManifest: []
      }),
    /Unknown provider/
  );
});

test("provider adapters validate staged configuration", () => {
  const adapters = getProviderAdapters();

  assert.throws(
    () => adapters.procore.validateConfiguration({ staged: false }),
    /requires staged=true/
  );
});

test("provider adapters keep live writes disabled", () => {
  const adapters = getProviderAdapters();

  assert.throws(() => adapters.autodesk_aps.uploadFile(), /remain disabled/);
});

test("simulated transfer pipeline runs through mock auth, transfer, status, and report", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const transferPackage = createTransferPackage({
    id: "transfer-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    destinationProvider: "trimble_connect",
    sheetManifest: ["sheet:A101"],
    modelManifest: ["model:M-1"]
  });
  const result = simulateTransferPipeline({
    session,
    transferPackage,
    config: {
      staged: true,
      documentationHost: "https://example.invalid/docs/trimble"
    }
  });

  assert.equal(result.authResult.authenticated, true);
  assert.equal(result.transferResult.status, "simulated_queued");
  assert.equal(result.statusResult.status, "simulated_completed");
  assert.equal(result.report.reportStatus, "generated");
});

test("transfer audit emits audit and outbox events", () => {
  const session = createSyntheticSession({
    sessionId: "s1",
    tenantId: "tenant-a",
    userId: "user-a",
    allowedProjectIds: ["project-a"],
    staged: true
  });
  const transferPackage = createTransferPackage({
    id: "transfer-a",
    tenantId: "tenant-a",
    projectId: "project-a",
    destinationProvider: "microsoft_graph",
    sheetManifest: [],
    modelManifest: []
  });
  const result = emitTransferAudit({
    session,
    transferPackage,
    action: "integration.transfer.simulated"
  });

  assert.equal(result.auditEvent.action, "integration.transfer.simulated");
  assert.equal(result.outboxEvent.eventType, "integration.transfer.simulated");
});
