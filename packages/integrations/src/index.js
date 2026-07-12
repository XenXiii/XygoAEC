import { createAuditEvent, createOutboxEvent } from "../../audit/src/foundation.js";
import { assertProjectAccess, assertSessionTenantAccess } from "../../auth/src/synthetic-auth.js";
import { assertStagedOutboundOperation } from "../../staged-mode/src/index.js";

const PROVIDER_SET = new Set(["autodesk_aps", "procore", "trimble_connect", "microsoft_graph"]);

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

function requiredArray(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
}

function makeAdapter(provider) {
  if (!PROVIDER_SET.has(provider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return {
    provider,
    validateConfiguration(config = {}) {
      if (config.staged !== true) {
        throw new Error(`${provider} adapter requires staged=true.`);
      }

      assertStagedOutboundOperation({
        config: {},
        target: config.documentationHost ?? "https://example.invalid/docs",
        method: "GET"
      });

      return {
        valid: true,
        provider,
        mode: "mock_only"
      };
    },
    validatePackage(transferPackage) {
      requiredString(transferPackage?.id, "Transfer package id");
      requiredString(transferPackage?.tenantId, "Transfer package tenantId");
      requiredString(transferPackage?.projectId, "Transfer package projectId");
      requiredArray(transferPackage?.sheetManifest ?? [], "Transfer package sheetManifest");
      requiredArray(transferPackage?.modelManifest ?? [], "Transfer package modelManifest");

      return {
        valid: true,
        provider,
        manifestCounts: {
          sheets: transferPackage.sheetManifest.length,
          models: transferPackage.modelManifest.length
        }
      };
    },
    simulateAuthentication(config = {}) {
      this.validateConfiguration(config);

      return {
        provider,
        authenticated: true,
        staged: true,
        tokenType: "simulated_bearer",
        expiresInSeconds: 3600
      };
    },
    simulateTransfer(transferPackage, config = {}) {
      this.validateConfiguration(config);
      this.validatePackage(transferPackage);

      return {
        provider,
        transferId: `transfer-${provider}-${transferPackage.id}`,
        status: "simulated_queued",
        staged: true
      };
    },
    getSimulatedStatus(transferId) {
      requiredString(transferId, "Transfer id");

      return {
        provider,
        transferId,
        status: "simulated_completed",
        staged: true
      };
    },
    cancelSimulation(transferId) {
      requiredString(transferId, "Transfer id");

      return {
        provider,
        transferId,
        status: "simulated_cancelled",
        staged: true
      };
    },
    generateTransferReport(transferPackage) {
      this.validatePackage(transferPackage);

      return {
        provider,
        transferPackageId: transferPackage.id,
        reportStatus: "generated",
        staged: true
      };
    },
    createFolder() {
      throw new Error(`${provider} live write operations remain disabled in staged mode.`);
    },
    uploadFile() {
      throw new Error(`${provider} live write operations remain disabled in staged mode.`);
    },
    publishModel() {
      throw new Error(`${provider} live write operations remain disabled in staged mode.`);
    }
  };
}

export function createTransferPackage(input) {
  requiredString(input?.id, "Transfer package id");
  requiredString(input?.tenantId, "Transfer package tenantId");
  requiredString(input?.projectId, "Transfer package projectId");
  requiredString(input?.destinationProvider, "Transfer package destinationProvider");
  requiredArray(input?.sheetManifest ?? [], "Transfer package sheetManifest");
  requiredArray(input?.modelManifest ?? [], "Transfer package modelManifest");

  if (!PROVIDER_SET.has(input.destinationProvider)) {
    throw new Error(`Unknown provider: ${input.destinationProvider}`);
  }

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    destinationProvider: input.destinationProvider,
    latestApprovedRevisionRefs: input.latestApprovedRevisionRefs ?? [],
    sheetManifest: input.sheetManifest,
    modelManifest: input.modelManifest,
    fileHashes: input.fileHashes ?? [],
    metadataManifest: input.metadataManifest ?? {},
    markupHistory: input.markupHistory ?? [],
    coordinationIssueLog: input.coordinationIssueLog ?? [],
    approvalStatus: input.approvalStatus ?? "pending",
    requestedByIdentity: input.requestedByIdentity ?? "synthetic-user",
    requiredApprovals: input.requiredApprovals ?? [],
    stagedTransferTimestamp: input.stagedTransferTimestamp ?? new Date().toISOString(),
    mockProviderResponse: input.mockProviderResponse ?? null,
    idempotencyKey: input.idempotencyKey ?? `idem-${input.id}`,
    staged: true
  };
}

export function getProviderAdapters() {
  return {
    autodesk_aps: makeAdapter("autodesk_aps"),
    procore: makeAdapter("procore"),
    trimble_connect: makeAdapter("trimble_connect"),
    microsoft_graph: makeAdapter("microsoft_graph")
  };
}

export function simulateTransferPipeline({ session, transferPackage, config = {} }) {
  assertSessionTenantAccess(session, transferPackage.tenantId);
  assertProjectAccess(session, transferPackage.projectId);

  const adapters = getProviderAdapters();
  const adapter = adapters[transferPackage.destinationProvider];
  const authResult = adapter.simulateAuthentication(config);
  const transferResult = adapter.simulateTransfer(transferPackage, config);
  const statusResult = adapter.getSimulatedStatus(transferResult.transferId);
  const report = adapter.generateTransferReport(transferPackage);

  return {
    authResult,
    transferResult,
    statusResult,
    report
  };
}

export function emitTransferAudit({ session, transferPackage, action }) {
  return {
    auditEvent: createAuditEvent({
      tenantId: transferPackage.tenantId,
      actorType: "user",
      actorId: session.userId,
      action,
      resourceType: "transfer_package",
      resourceId: transferPackage.id
    }),
    outboxEvent: createOutboxEvent({
      eventType: action,
      aggregateType: "transfer_package",
      aggregateId: transferPackage.id,
      tenantId: transferPackage.tenantId,
      payload: {
        destinationProvider: transferPackage.destinationProvider
      }
    })
  };
}
