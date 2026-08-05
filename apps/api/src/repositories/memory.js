import { createProject } from "../../../../packages/shared-contracts/src/foundation.js";
import { createCoordinationIssue, createRfi } from "../../../../packages/coordination/src/index.js";
import { createFinding, createReviewRun, setHumanDisposition } from "../../../../packages/ai-review/src/index.js";
import { createPermitPackage } from "../../../../packages/permits/src/index.js";
import { createReviewSession } from "../../../../packages/projects/src/index.js";
import { generatePlatformBlueprint } from "../../../../packages/platform-blueprint/src/index.js";
import { createFieldReport } from "../../../../packages/field-reporting/src/index.js";
import {
  applyEmailWebhookStatus,
  createEmailSuppressionFromWebhook,
  emailDeliveryIntentMatches,
  mergeEmailSuppression,
  normalizeEmailRecipient,
  summarizeEmailDeliveryHealth,
  summarizeWorkerHeartbeat
} from "../../../../packages/email-delivery/src/index.js";
import { createSeedState } from "./seed.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createMemoryRepository() {
  const seedState = createSeedState();
  const projectStore = new Map(
    seedState.projects.map((project) => [project.id, clone(project)])
  );
  const issueStore = new Map(
    seedState.issues.map((issue) => [issue.id, clone(issue)])
  );
  const rfiStore = new Map(
    seedState.rfis.map((rfi) => [rfi.id, clone(rfi)])
  );
  const permitStore = new Map(
    seedState.permitPackages.map((permitPackage) => [permitPackage.id, clone(permitPackage)])
  );
  const reviewSessionStore = new Map(
    seedState.reviewSessions.map((reviewSession) => [reviewSession.id, clone(reviewSession)])
  );
  const aiReviewRunStore = new Map(
    seedState.aiReviewRuns.map((reviewRun) => [reviewRun.id, clone(reviewRun)])
  );
  const aiFindingStore = new Map(
    seedState.aiFindings.map((finding) => [finding.id, clone(finding)])
  );
  const platformBlueprintStore = new Map(
    seedState.platformBlueprints.map((blueprint) => [blueprint.id, clone(blueprint)])
  );
  const fieldReportStore = new Map(
    seedState.fieldReports.map((fieldReport) => [fieldReport.id, clone(fieldReport)])
  );
  const fileRecordStore = new Map(
    seedState.fileRecords.map((fileRecord) => [fileRecord.id, clone(fileRecord)])
  );
  const emailDeliveryStore = new Map(
    seedState.emailDeliveries.map((delivery) => [delivery.id, clone(delivery)])
  );
  const emailSuppressionStore = new Map(
    seedState.emailSuppressions.map((item) => [`${item.tenantId}:${item.normalizedRecipient}`, clone(item)])
  );
  const emailWebhookEventStore = new Map(seedState.emailWebhookEvents.map((event) => [event.id, clone(event)]));
  const serviceHeartbeatStore = new Map(
    seedState.serviceHeartbeats.map((heartbeat) => [`${heartbeat.serviceName}:${heartbeat.instanceId}`, clone(heartbeat)])
  );
  const auditEventStore = seedState.auditEvents.map((event) => clone(event));

  return {
    listProjectsByTenant(tenantId) {
      return Array.from(projectStore.values()).filter((project) => project.tenantId === tenantId);
    },
    getProjectById(projectId) {
      return projectStore.get(projectId) ?? null;
    },
    createProject(input) {
      const project = createProject({
        ...input,
        staged: true
      });

      if (projectStore.has(project.id)) {
        throw new Error("Project id already exists.");
      }

      projectStore.set(project.id, clone(project));
      return clone(project);
    },
    listIssuesByTenant(tenantId) {
      return Array.from(issueStore.values()).filter((issue) => issue.tenantId === tenantId);
    },
    listIssuesByProject(projectId) {
      return Array.from(issueStore.values()).filter((issue) => issue.projectId === projectId);
    },
    createIssue(input) {
      const issue = createCoordinationIssue({
        ...input,
        staged: true
      });

      if (issueStore.has(issue.id)) {
        throw new Error("Coordination issue id already exists.");
      }

      issueStore.set(issue.id, clone(issue));
      return clone(issue);
    },
    listRfisByTenant(tenantId) {
      return Array.from(rfiStore.values()).filter((rfi) => rfi.tenantId === tenantId);
    },
    createRfi(input) {
      const rfi = createRfi({
        ...input,
        staged: true
      });

      if (rfiStore.has(rfi.id)) {
        throw new Error("RFI id already exists.");
      }

      rfiStore.set(rfi.id, clone(rfi));
      return clone(rfi);
    },
    listPermitPackagesByTenant(tenantId) {
      return Array.from(permitStore.values()).filter((permitPackage) => permitPackage.tenantId === tenantId);
    },
    createPermitPackage(input) {
      const permitPackage = createPermitPackage({
        ...input,
        staged: true
      });

      if (permitStore.has(permitPackage.id)) {
        throw new Error("Permit package id already exists.");
      }

      permitStore.set(permitPackage.id, clone(permitPackage));
      return clone(permitPackage);
    },
    listReviewSessionsByTenant(tenantId) {
      return Array.from(reviewSessionStore.values()).filter(
        (reviewSession) => reviewSession.tenantId === tenantId
      );
    },
    createReviewSession(input) {
      const reviewSession = createReviewSession({
        ...input,
        staged: true
      });

      if (reviewSessionStore.has(reviewSession.id)) {
        throw new Error("Review session id already exists.");
      }

      reviewSessionStore.set(reviewSession.id, clone(reviewSession));
      return clone(reviewSession);
    },
    listAiReviewRunsByTenant(tenantId) {
      return Array.from(aiReviewRunStore.values()).filter((reviewRun) => reviewRun.tenantId === tenantId);
    },
    getAiReviewRunById(reviewRunId) {
      return aiReviewRunStore.get(reviewRunId) ?? null;
    },
    createAiReviewRun(input) {
      const reviewRun = createReviewRun({
        ...input,
        staged: true
      });

      if (aiReviewRunStore.has(reviewRun.id)) {
        throw new Error("AI review run id already exists.");
      }

      aiReviewRunStore.set(reviewRun.id, clone(reviewRun));
      return clone(reviewRun);
    },
    listAiFindingsByTenant(tenantId) {
      return Array.from(aiFindingStore.values()).filter((finding) => {
        const reviewRun = aiReviewRunStore.get(finding.reviewRunId);
        return reviewRun?.tenantId === tenantId;
      });
    },
    getAiFindingById(findingId) {
      return aiFindingStore.get(findingId) ?? null;
    },
    createAiFinding(input) {
      const finding = createFinding({
        ...input,
        staged: true
      });

      if (aiFindingStore.has(finding.id)) {
        throw new Error("AI finding id already exists.");
      }

      aiFindingStore.set(finding.id, clone(finding));
      return clone(finding);
    },
    setAiFindingDisposition({ findingId, nextDisposition, relatedIssueId = null }) {
      const finding = aiFindingStore.get(findingId);

      if (!finding) {
        throw new Error("AI finding not found.");
      }

      const updatedFinding = setHumanDisposition({
        session: null,
        finding,
        nextDisposition,
        relatedIssueId
      });

      aiFindingStore.set(findingId, clone(updatedFinding));
      return clone(updatedFinding);
    },
    listPlatformBlueprintsByTenant(tenantId) {
      return Array.from(platformBlueprintStore.values()).filter((blueprint) => blueprint.tenantId === tenantId);
    },
    getPlatformBlueprintById(blueprintId) {
      return platformBlueprintStore.get(blueprintId) ?? null;
    },
    createPlatformBlueprint(input) {
      const blueprint = generatePlatformBlueprint({ ...input, staged: true });

      if (platformBlueprintStore.has(blueprint.id)) {
        throw new Error("Platform blueprint id already exists.");
      }

      platformBlueprintStore.set(blueprint.id, clone(blueprint));
      return clone(blueprint);
    },
    listFieldReportsByTenant(tenantId) {
      return Array.from(fieldReportStore.values()).filter((report) => report.tenantId === tenantId);
    },
    getFieldReportById(reportId) {
      return fieldReportStore.get(reportId) ?? null;
    },
    createFieldReport(input) {
      const report = createFieldReport({ ...input, staged: true });
      if (fieldReportStore.has(report.id)) {
        throw new Error("Field report id already exists.");
      }
      fieldReportStore.set(report.id, clone(report));
      return clone(report);
    },
    saveFieldReport(report) {
      fieldReportStore.set(report.id, clone(report));
      return clone(report);
    },
    listFileRecordsByTenant(tenantId) {
      return Array.from(fileRecordStore.values())
        .filter((fileRecord) => fileRecord.tenantId === tenantId)
        .map((fileRecord) => clone(fileRecord));
    },
    getFileRecordById(fileId) {
      const fileRecord = fileRecordStore.get(fileId);
      return fileRecord ? clone(fileRecord) : null;
    },
    createFileRecord(fileRecord) {
      if (fileRecordStore.has(fileRecord.id)) throw new Error("File id already exists.");
      fileRecordStore.set(fileRecord.id, clone(fileRecord));
      return clone(fileRecord);
    },
    saveFileRecord(fileRecord) {
      if (!fileRecordStore.has(fileRecord.id)) throw new Error("File record not found.");
      fileRecordStore.set(fileRecord.id, clone(fileRecord));
      return clone(fileRecord);
    },
    createEmailDelivery(delivery) {
      const existing = Array.from(emailDeliveryStore.values()).find((item) => item.idempotencyKey === delivery.idempotencyKey);
      if (existing) {
        if (!emailDeliveryIntentMatches(existing, delivery)) {
          const error = new Error("Email delivery idempotency key is bound to a different logical delivery.");
          error.code = "email_idempotency_conflict";
          throw error;
        }
        return { created: false, delivery: clone(existing) };
      }
      if (emailDeliveryStore.has(delivery.id)) throw new Error("Email delivery id already exists.");
      emailDeliveryStore.set(delivery.id, clone(delivery));
      return { created: true, delivery: clone(delivery) };
    },
    getEmailDeliveryById(deliveryId) {
      const delivery = emailDeliveryStore.get(deliveryId);
      return delivery ? clone(delivery) : null;
    },
    listEmailDeliveriesByTenant(tenantId) {
      return Array.from(emailDeliveryStore.values()).filter((delivery) => delivery.tenantId === tenantId).map(clone);
    },
    getEmailSuppression(tenantId, recipientEmail) {
      return clone(emailSuppressionStore.get(`${tenantId}:${normalizeEmailRecipient(recipientEmail)}`) ?? null);
    },
    listEmailSuppressionsByTenant(tenantId) {
      return Array.from(emailSuppressionStore.values()).filter((item) => item.tenantId === tenantId).map(clone);
    },
    saveEmailDelivery(delivery) {
      if (!emailDeliveryStore.has(delivery.id)) throw new Error("Email delivery not found.");
      emailDeliveryStore.set(delivery.id, clone(delivery));
      return clone(delivery);
    },
    finalizeEmailDelivery({ delivery, auditEvent = null, auditEventFactory = null }) {
      if (!emailDeliveryStore.has(delivery.id)) throw new Error("Email delivery not found.");
      emailDeliveryStore.set(delivery.id, clone(delivery));
      const previous = auditEventStore.filter((event) => event.tenantId === delivery.tenantId).at(-1);
      const evidence = auditEventFactory ? auditEventFactory(previous?.eventHash ?? null) : auditEvent;
      if (evidence && !auditEventStore.some((event) => event.eventId === evidence.eventId)) auditEventStore.push(clone(evidence));
      return clone(delivery);
    },
    applyEmailWebhook({ webhookId, event, auditEvent = null, auditEventFactory = null }) {
      if (emailWebhookEventStore.has(webhookId)) return { duplicate: true, delivery: null };
      const delivery = Array.from(emailDeliveryStore.values()).find(
        (item) => item.providerMessageId === event?.data?.email_id
      );
      if (!delivery) return { duplicate: false, delivery: null };
      const updated = applyEmailWebhookStatus(delivery, event);
      emailDeliveryStore.set(updated.id, clone(updated));
      const incomingSuppression = createEmailSuppressionFromWebhook(updated, event, { webhookId });
      if (incomingSuppression) {
        const key = `${incomingSuppression.tenantId}:${incomingSuppression.normalizedRecipient}`;
        emailSuppressionStore.set(key, mergeEmailSuppression(emailSuppressionStore.get(key), incomingSuppression));
      }
      emailWebhookEventStore.set(webhookId, { id: webhookId, tenantId: updated.tenantId, event: clone(event) });
      const previous = auditEventStore.filter((item) => item.tenantId === updated.tenantId).at(-1);
      const evidence = auditEventFactory ? auditEventFactory(updated, previous?.eventHash ?? null) : auditEvent;
      if (evidence && !auditEventStore.some((item) => item.eventId === evidence.eventId)) auditEventStore.push(clone(evidence));
      return { duplicate: false, delivery: clone(updated) };
    },
    recordServiceHeartbeat(heartbeat) {
      serviceHeartbeatStore.set(`${heartbeat.serviceName}:${heartbeat.instanceId}`, clone(heartbeat));
      return clone(heartbeat);
    },
    checkEmailDeliveryReadiness(options = {}) {
      return summarizeEmailDeliveryHealth(Array.from(emailDeliveryStore.values()), options);
    },
    checkWorkerReadiness(options = {}) {
      return summarizeWorkerHeartbeat(Array.from(serviceHeartbeatStore.values()), options);
    },
    finalizeFileRecord({ fileRecord, auditEvent }) {
      if (!fileRecordStore.has(fileRecord.id)) throw new Error("File record not found.");
      fileRecordStore.set(fileRecord.id, clone(fileRecord));
      auditEventStore.push(clone(auditEvent));
      return clone(fileRecord);
    },
    listAuditEventsByTenant(tenantId) {
      return auditEventStore.filter((event) => event.tenantId === tenantId).map((event) => clone(event));
    },
    appendAuditEvent(event) {
      auditEventStore.push(clone(event));
      return clone(event);
    }
  };
}
