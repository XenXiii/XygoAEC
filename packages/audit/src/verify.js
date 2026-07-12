import { buildAuditVerificationReport, createAuditEvent } from "./foundation.js";

const sampleEventA = createAuditEvent({
  tenantId: "tenant-sample",
  action: "sample.created",
  resourceType: "sample",
  resourceId: "1"
});
const sampleEventB = createAuditEvent({
  tenantId: "tenant-sample",
  action: "sample.updated",
  resourceType: "sample",
  resourceId: "1",
  previousHash: sampleEventA.eventHash
});

const report = buildAuditVerificationReport([sampleEventA, sampleEventB]);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
