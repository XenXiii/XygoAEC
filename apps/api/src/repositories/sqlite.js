import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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
import { cloneState, createSeedState } from "./seed.js";

const migrationPath = path.resolve(process.cwd(), "infrastructure/migrations/0001_staged_api.sql");

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function parseRow(row) {
  return row ? JSON.parse(row.payload) : null;
}

function parseRows(rows) {
  return rows.map((row) => JSON.parse(row.payload));
}

function seedTable(database, tableName, rows, toColumns) {
  const count = database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
  if (count > 0) {
    return;
  }

  const insert = toColumns.insert(database);
  for (const row of rows) {
    insert.run(...toColumns.values(row));
  }
}

export function createSqliteRepository({ filePath }) {
  if (!filePath) {
    throw new Error("filePath is required for sqlite repository.");
  }

  ensureDirectory(filePath);
  const database = new DatabaseSync(filePath);
  database.exec(fs.readFileSync(migrationPath, "utf8"));
  const webhookColumns = database.prepare("PRAGMA table_info(email_webhook_events)").all();
  if (!webhookColumns.some((column) => column.name === "tenant_id")) {
    database.exec("ALTER TABLE email_webhook_events ADD COLUMN tenant_id TEXT");
  }
  database.exec(
    "CREATE INDEX IF NOT EXISTS idx_staged_email_webhook_tenant " +
    "ON email_webhook_events(tenant_id, occurred_at)"
  );

  const seedState = createSeedState();
  seedTable(database, "projects", seedState.projects, {
    insert: (db) => db.prepare("INSERT INTO projects (id, tenant_id, payload) VALUES (?, ?, ?)"),
    values: (row) => [row.id, row.tenantId, JSON.stringify(row)]
  });
  seedTable(database, "issues", seedState.issues, {
    insert: (db) => db.prepare("INSERT INTO issues (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)"),
    values: (row) => [row.id, row.tenantId, row.projectId, JSON.stringify(row)]
  });
  seedTable(database, "rfis", seedState.rfis, {
    insert: (db) => db.prepare("INSERT INTO rfis (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)"),
    values: (row) => [row.id, row.tenantId, row.projectId, JSON.stringify(row)]
  });
  seedTable(database, "permit_packages", seedState.permitPackages, {
    insert: (db) => db.prepare("INSERT INTO permit_packages (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)"),
    values: (row) => [row.id, row.tenantId, row.projectId, JSON.stringify(row)]
  });
  seedTable(database, "review_sessions", seedState.reviewSessions, {
    insert: (db) => db.prepare("INSERT INTO review_sessions (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)"),
    values: (row) => [row.id, row.tenantId, row.projectId, JSON.stringify(row)]
  });
  seedTable(database, "ai_review_runs", seedState.aiReviewRuns, {
    insert: (db) => db.prepare("INSERT INTO ai_review_runs (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)"),
    values: (row) => [row.id, row.tenantId, row.projectId, JSON.stringify(row)]
  });
  seedTable(database, "ai_findings", seedState.aiFindings, {
    insert: (db) => db.prepare("INSERT INTO ai_findings (id, tenant_id, review_run_id, payload) VALUES (?, ?, ?, ?)"),
    values: (row) => {
      const reviewRun = seedState.aiReviewRuns.find((item) => item.id === row.reviewRunId);
      return [row.id, reviewRun?.tenantId ?? "unknown", row.reviewRunId, JSON.stringify(row)];
    }
  });
  seedTable(database, "audit_events", seedState.auditEvents, {
    insert: (db) => db.prepare("INSERT INTO audit_events (event_id, tenant_id, payload) VALUES (?, ?, ?)"),
    values: (row) => [row.eventId, row.tenantId, JSON.stringify(row)]
  });
  seedTable(database, "platform_blueprints", seedState.platformBlueprints, {
    insert: (db) => db.prepare("INSERT INTO platform_blueprints (id, tenant_id, payload) VALUES (?, ?, ?)"),
    values: (row) => [row.id, row.tenantId, JSON.stringify(row)]
  });
  seedTable(database, "field_reports", seedState.fieldReports, {
    insert: (db) => db.prepare("INSERT INTO field_reports (id, tenant_id, payload) VALUES (?, ?, ?)"),
    values: (row) => [row.id, row.tenantId, JSON.stringify(row)]
  });
  seedTable(database, "file_records", seedState.fileRecords, {
    insert: (db) => db.prepare(
      "INSERT INTO file_records (id, tenant_id, project_id, field_report_id, status, payload) VALUES (?, ?, ?, ?, ?, ?)"
    ),
    values: (row) => [row.id, row.tenantId, row.projectId, row.fieldReportId ?? null, row.status, JSON.stringify(row)]
  });
  seedTable(database, "email_deliveries", seedState.emailDeliveries, {
    insert: (db) => db.prepare(
      "INSERT INTO email_deliveries (id, tenant_id, recipient_user_id, recipient_email, kind, resource_type, resource_id, " +
      "idempotency_key, status, attempts, provider, provider_message_id, provider_status_at, last_error, payload, created_at, " +
      "updated_at, accepted_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    values: (row) => [row.id, row.tenantId, row.recipientUserId, row.recipientEmail, row.kind, row.resourceType,
      row.resourceId, row.idempotencyKey, row.status, row.attempts, row.provider, row.providerMessageId,
      row.providerStatusAt, row.lastError, JSON.stringify(row), row.createdAt, row.updatedAt, row.acceptedAt, row.deliveredAt]
  });
  seedTable(database, "email_suppressions", seedState.emailSuppressions, {
    insert: (db) => db.prepare(
      "INSERT INTO email_suppressions (id, tenant_id, normalized_recipient, reason, source, provider_event_id, payload, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ),
    values: (row) => [row.id, row.tenantId, row.normalizedRecipient, row.reason, row.source,
      row.providerEventId, JSON.stringify(row), row.createdAt, row.updatedAt]
  });

  return {
    filePath,
    listProjectsByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM projects WHERE tenant_id = ?").all(tenantId));
    },
    getProjectById(projectId) {
      return parseRow(database.prepare("SELECT payload FROM projects WHERE id = ?").get(projectId));
    },
    createProject(input) {
      const project = createProject({
        ...input,
        staged: true
      });

      const exists = database.prepare("SELECT 1 FROM projects WHERE id = ?").get(project.id);
      if (exists) {
        throw new Error("Project id already exists.");
      }

      database.prepare("INSERT INTO projects (id, tenant_id, payload) VALUES (?, ?, ?)").run(
        project.id,
        project.tenantId,
        JSON.stringify(project)
      );

      return cloneState(project);
    },
    listIssuesByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM issues WHERE tenant_id = ?").all(tenantId));
    },
    listIssuesByProject(projectId) {
      return parseRows(database.prepare("SELECT payload FROM issues WHERE project_id = ?").all(projectId));
    },
    createIssue(input) {
      const issue = createCoordinationIssue({
        ...input,
        staged: true
      });

      const exists = database.prepare("SELECT 1 FROM issues WHERE id = ?").get(issue.id);
      if (exists) {
        throw new Error("Coordination issue id already exists.");
      }

      database.prepare("INSERT INTO issues (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)").run(
        issue.id,
        issue.tenantId,
        issue.projectId,
        JSON.stringify(issue)
      );

      return cloneState(issue);
    },
    listRfisByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM rfis WHERE tenant_id = ?").all(tenantId));
    },
    createRfi(input) {
      const rfi = createRfi({
        ...input,
        staged: true
      });

      const exists = database.prepare("SELECT 1 FROM rfis WHERE id = ?").get(rfi.id);
      if (exists) {
        throw new Error("RFI id already exists.");
      }

      database.prepare("INSERT INTO rfis (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)").run(
        rfi.id,
        rfi.tenantId,
        rfi.projectId,
        JSON.stringify(rfi)
      );

      return cloneState(rfi);
    },
    listPermitPackagesByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM permit_packages WHERE tenant_id = ?").all(tenantId));
    },
    createPermitPackage(input) {
      const permitPackage = createPermitPackage({
        ...input,
        staged: true
      });

      const exists = database.prepare("SELECT 1 FROM permit_packages WHERE id = ?").get(permitPackage.id);
      if (exists) {
        throw new Error("Permit package id already exists.");
      }

      database.prepare("INSERT INTO permit_packages (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)").run(
        permitPackage.id,
        permitPackage.tenantId,
        permitPackage.projectId,
        JSON.stringify(permitPackage)
      );

      return cloneState(permitPackage);
    },
    listReviewSessionsByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM review_sessions WHERE tenant_id = ?").all(tenantId));
    },
    createReviewSession(input) {
      const reviewSession = createReviewSession({
        ...input,
        staged: true
      });

      const exists = database.prepare("SELECT 1 FROM review_sessions WHERE id = ?").get(reviewSession.id);
      if (exists) {
        throw new Error("Review session id already exists.");
      }

      database.prepare("INSERT INTO review_sessions (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)").run(
        reviewSession.id,
        reviewSession.tenantId,
        reviewSession.projectId,
        JSON.stringify(reviewSession)
      );

      return cloneState(reviewSession);
    },
    listAiReviewRunsByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM ai_review_runs WHERE tenant_id = ?").all(tenantId));
    },
    getAiReviewRunById(reviewRunId) {
      return parseRow(database.prepare("SELECT payload FROM ai_review_runs WHERE id = ?").get(reviewRunId));
    },
    createAiReviewRun(input) {
      const reviewRun = createReviewRun({
        ...input,
        staged: true
      });

      const exists = database.prepare("SELECT 1 FROM ai_review_runs WHERE id = ?").get(reviewRun.id);
      if (exists) {
        throw new Error("AI review run id already exists.");
      }

      database.prepare("INSERT INTO ai_review_runs (id, tenant_id, project_id, payload) VALUES (?, ?, ?, ?)").run(
        reviewRun.id,
        reviewRun.tenantId,
        reviewRun.projectId,
        JSON.stringify(reviewRun)
      );

      return cloneState(reviewRun);
    },
    listAiFindingsByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM ai_findings WHERE tenant_id = ?").all(tenantId));
    },
    getAiFindingById(findingId) {
      return parseRow(database.prepare("SELECT payload FROM ai_findings WHERE id = ?").get(findingId));
    },
    createAiFinding(input) {
      const reviewRun = parseRow(database.prepare("SELECT payload FROM ai_review_runs WHERE id = ?").get(input.reviewRunId));
      const finding = createFinding({
        ...input,
        staged: true
      });

      const exists = database.prepare("SELECT 1 FROM ai_findings WHERE id = ?").get(finding.id);
      if (exists) {
        throw new Error("AI finding id already exists.");
      }

      database.prepare("INSERT INTO ai_findings (id, tenant_id, review_run_id, payload) VALUES (?, ?, ?, ?)").run(
        finding.id,
        reviewRun?.tenantId ?? "unknown",
        finding.reviewRunId,
        JSON.stringify(finding)
      );

      return cloneState(finding);
    },
    setAiFindingDisposition({ findingId, nextDisposition, relatedIssueId = null }) {
      const finding = parseRow(database.prepare("SELECT payload FROM ai_findings WHERE id = ?").get(findingId));

      if (!finding) {
        throw new Error("AI finding not found.");
      }

      const updatedFinding = setHumanDisposition({
        session: null,
        finding,
        nextDisposition,
        relatedIssueId
      });

      const tenantId = database.prepare("SELECT tenant_id FROM ai_findings WHERE id = ?").get(findingId).tenant_id;
      database.prepare("UPDATE ai_findings SET payload = ? WHERE id = ?").run(JSON.stringify(updatedFinding), findingId);
      database.prepare("UPDATE ai_findings SET tenant_id = ?, review_run_id = ? WHERE id = ?").run(
        tenantId,
        updatedFinding.reviewRunId,
        findingId
      );

      return cloneState(updatedFinding);
    },
    listPlatformBlueprintsByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM platform_blueprints WHERE tenant_id = ?").all(tenantId));
    },
    getPlatformBlueprintById(blueprintId) {
      return parseRow(database.prepare("SELECT payload FROM platform_blueprints WHERE id = ?").get(blueprintId));
    },
    createPlatformBlueprint(input) {
      const blueprint = generatePlatformBlueprint({ ...input, staged: true });

      const exists = database.prepare("SELECT 1 FROM platform_blueprints WHERE id = ?").get(blueprint.id);
      if (exists) {
        throw new Error("Platform blueprint id already exists.");
      }

      database.prepare("INSERT INTO platform_blueprints (id, tenant_id, payload) VALUES (?, ?, ?)").run(
        blueprint.id,
        blueprint.tenantId,
        JSON.stringify(blueprint)
      );

      return cloneState(blueprint);
    },
    listFieldReportsByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM field_reports WHERE tenant_id = ?").all(tenantId));
    },
    getFieldReportById(reportId) {
      return parseRow(database.prepare("SELECT payload FROM field_reports WHERE id = ?").get(reportId));
    },
    createFieldReport(input) {
      const report = createFieldReport({ ...input, staged: true });
      const exists = database.prepare("SELECT 1 FROM field_reports WHERE id = ?").get(report.id);
      if (exists) {
        throw new Error("Field report id already exists.");
      }
      database.prepare("INSERT INTO field_reports (id, tenant_id, payload) VALUES (?, ?, ?)").run(
        report.id,
        report.tenantId,
        JSON.stringify(report)
      );
      return cloneState(report);
    },
    saveFieldReport(report) {
      database.prepare("INSERT OR REPLACE INTO field_reports (id, tenant_id, payload) VALUES (?, ?, ?)").run(
        report.id,
        report.tenantId,
        JSON.stringify(report)
      );
      return cloneState(report);
    },
    listFileRecordsByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM file_records WHERE tenant_id = ? ORDER BY rowid ASC").all(tenantId));
    },
    getFileRecordById(fileId) {
      return parseRow(database.prepare("SELECT payload FROM file_records WHERE id = ?").get(fileId));
    },
    createFileRecord(fileRecord) {
      const exists = database.prepare("SELECT 1 FROM file_records WHERE id = ?").get(fileRecord.id);
      if (exists) throw new Error("File id already exists.");
      database.prepare(
        "INSERT INTO file_records (id, tenant_id, project_id, field_report_id, status, payload) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(
        fileRecord.id,
        fileRecord.tenantId,
        fileRecord.projectId,
        fileRecord.fieldReportId ?? null,
        fileRecord.status,
        JSON.stringify(fileRecord)
      );
      return cloneState(fileRecord);
    },
    saveFileRecord(fileRecord) {
      const result = database.prepare(
        "UPDATE file_records SET tenant_id = ?, project_id = ?, field_report_id = ?, status = ?, payload = ? WHERE id = ?"
      ).run(
        fileRecord.tenantId,
        fileRecord.projectId,
        fileRecord.fieldReportId ?? null,
        fileRecord.status,
        JSON.stringify(fileRecord),
        fileRecord.id
      );
      if (result.changes !== 1) throw new Error("File record not found.");
      return cloneState(fileRecord);
    },
    createEmailDelivery(delivery) {
      const existing = database.prepare("SELECT payload FROM email_deliveries WHERE idempotency_key = ?").get(delivery.idempotencyKey);
      if (existing) {
        const record = parseRow(existing);
        if (!emailDeliveryIntentMatches(record, delivery)) {
          const error = new Error("Email delivery idempotency key is bound to a different logical delivery.");
          error.code = "email_idempotency_conflict";
          throw error;
        }
        return { created: false, delivery: record };
      }
      database.prepare(
        "INSERT INTO email_deliveries (id, tenant_id, recipient_user_id, recipient_email, kind, resource_type, resource_id, " +
        "idempotency_key, status, attempts, provider, provider_message_id, provider_status_at, last_error, payload, created_at, " +
        "updated_at, accepted_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(delivery.id, delivery.tenantId, delivery.recipientUserId, delivery.recipientEmail, delivery.kind,
        delivery.resourceType, delivery.resourceId, delivery.idempotencyKey, delivery.status, delivery.attempts,
        delivery.provider, delivery.providerMessageId, delivery.providerStatusAt, delivery.lastError, JSON.stringify(delivery),
        delivery.createdAt, delivery.updatedAt, delivery.acceptedAt, delivery.deliveredAt);
      return { created: true, delivery: cloneState(delivery) };
    },
    getEmailDeliveryById(deliveryId) {
      return parseRow(database.prepare("SELECT payload FROM email_deliveries WHERE id = ?").get(deliveryId));
    },
    listEmailDeliveriesByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM email_deliveries WHERE tenant_id = ? ORDER BY created_at, id").all(tenantId));
    },
    getEmailSuppression(tenantId, recipientEmail) {
      return parseRow(database.prepare(
        "SELECT payload FROM email_suppressions WHERE tenant_id = ? AND normalized_recipient = ?"
      ).get(tenantId, normalizeEmailRecipient(recipientEmail)));
    },
    listEmailSuppressionsByTenant(tenantId) {
      return parseRows(database.prepare(
        "SELECT payload FROM email_suppressions WHERE tenant_id = ? ORDER BY updated_at, id"
      ).all(tenantId));
    },
    saveEmailDelivery(delivery) {
      const result = database.prepare(
        "UPDATE email_deliveries SET status = ?, attempts = ?, provider = ?, provider_message_id = ?, provider_status_at = ?, " +
        "last_error = ?, payload = ?, updated_at = ?, accepted_at = ?, delivered_at = ? WHERE id = ? AND tenant_id = ?"
      ).run(delivery.status, delivery.attempts, delivery.provider, delivery.providerMessageId, delivery.providerStatusAt,
        delivery.lastError, JSON.stringify(delivery), delivery.updatedAt, delivery.acceptedAt, delivery.deliveredAt,
        delivery.id, delivery.tenantId);
      if (result.changes !== 1) throw new Error("Email delivery not found.");
      return cloneState(delivery);
    },
    finalizeEmailDelivery({ delivery, auditEvent = null, auditEventFactory = null }) {
      database.exec("BEGIN IMMEDIATE");
      try {
        this.saveEmailDelivery(delivery);
        const previous = parseRow(database.prepare("SELECT payload FROM audit_events WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1").get(delivery.tenantId));
        const evidence = auditEventFactory ? auditEventFactory(previous?.eventHash ?? null) : auditEvent;
        if (evidence) database.prepare("INSERT OR IGNORE INTO audit_events (event_id, tenant_id, payload) VALUES (?, ?, ?)")
          .run(evidence.eventId, evidence.tenantId, JSON.stringify(evidence));
        database.exec("COMMIT");
        return cloneState(delivery);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    applyEmailWebhook({ webhookId, event, auditEvent = null, auditEventFactory = null }) {
      database.exec("BEGIN IMMEDIATE");
      try {
        if (database.prepare("SELECT 1 FROM email_webhook_events WHERE id = ?").get(webhookId)) {
          database.exec("COMMIT");
          return { duplicate: true, delivery: null };
        }
        const delivery = parseRow(database.prepare("SELECT payload FROM email_deliveries WHERE provider_message_id = ?").get(event?.data?.email_id));
        if (!delivery) {
          database.exec("ROLLBACK");
          return { duplicate: false, delivery: null };
        }
        const updated = applyEmailWebhookStatus(delivery, event);
        this.saveEmailDelivery(updated);
        const incomingSuppression = createEmailSuppressionFromWebhook(updated, event, { webhookId });
        if (incomingSuppression) {
          const existing = this.getEmailSuppression(incomingSuppression.tenantId, incomingSuppression.normalizedRecipient);
          const suppression = mergeEmailSuppression(existing, incomingSuppression);
          database.prepare(
            "INSERT INTO email_suppressions (id, tenant_id, normalized_recipient, reason, source, provider_event_id, payload, created_at, updated_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tenant_id, normalized_recipient) DO UPDATE SET " +
            "reason = excluded.reason, source = excluded.source, provider_event_id = excluded.provider_event_id, " +
            "payload = excluded.payload, updated_at = excluded.updated_at"
          ).run(suppression.id, suppression.tenantId, suppression.normalizedRecipient, suppression.reason,
            suppression.source, suppression.providerEventId, JSON.stringify(suppression), suppression.createdAt, suppression.updatedAt);
        }
        database.prepare(
          "INSERT INTO email_webhook_events (id, tenant_id, provider, provider_message_id, event_type, occurred_at, payload, processed_at) " +
          "VALUES (?, ?, 'resend', ?, ?, ?, ?, ?)"
        ).run(webhookId, updated.tenantId, event.data.email_id, event.type, event.created_at, JSON.stringify(event), new Date().toISOString());
        const previous = parseRow(database.prepare("SELECT payload FROM audit_events WHERE tenant_id = ? ORDER BY rowid DESC LIMIT 1").get(updated.tenantId));
        const evidence = auditEventFactory ? auditEventFactory(updated, previous?.eventHash ?? null) : auditEvent;
        if (evidence) database.prepare("INSERT OR IGNORE INTO audit_events (event_id, tenant_id, payload) VALUES (?, ?, ?)")
          .run(evidence.eventId, evidence.tenantId, JSON.stringify(evidence));
        database.exec("COMMIT");
        return { duplicate: false, delivery: cloneState(updated) };
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    recordServiceHeartbeat(heartbeat) {
      database.prepare(
        "INSERT INTO service_heartbeats (service_name, instance_id, status, last_seen_at, details) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT (service_name, instance_id) DO UPDATE SET status = excluded.status, last_seen_at = excluded.last_seen_at, details = excluded.details"
      ).run(heartbeat.serviceName, heartbeat.instanceId, heartbeat.status, heartbeat.lastSeenAt, JSON.stringify(heartbeat.details ?? {}));
      return cloneState(heartbeat);
    },
    checkEmailDeliveryReadiness(options = {}) {
      return summarizeEmailDeliveryHealth(parseRows(database.prepare("SELECT payload FROM email_deliveries").all()), options);
    },
    checkWorkerReadiness(options = {}) {
      const rows = database.prepare("SELECT service_name, instance_id, status, last_seen_at, details FROM service_heartbeats").all();
      return summarizeWorkerHeartbeat(rows.map((row) => ({
        serviceName: row.service_name,
        instanceId: row.instance_id,
        status: row.status,
        lastSeenAt: row.last_seen_at,
        details: JSON.parse(row.details)
      })), options);
    },
    finalizeFileRecord({ fileRecord, auditEvent }) {
      database.exec("BEGIN IMMEDIATE");
      try {
        const result = database.prepare(
          "UPDATE file_records SET tenant_id = ?, project_id = ?, field_report_id = ?, status = ?, payload = ? WHERE id = ?"
        ).run(
          fileRecord.tenantId,
          fileRecord.projectId,
          fileRecord.fieldReportId ?? null,
          fileRecord.status,
          JSON.stringify(fileRecord),
          fileRecord.id
        );
        if (result.changes !== 1) throw new Error("File record not found.");
        database.prepare("INSERT INTO audit_events (event_id, tenant_id, payload) VALUES (?, ?, ?)").run(
          auditEvent.eventId,
          auditEvent.tenantId,
          JSON.stringify(auditEvent)
        );
        database.exec("COMMIT");
        return cloneState(fileRecord);
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    listAuditEventsByTenant(tenantId) {
      return parseRows(database.prepare("SELECT payload FROM audit_events WHERE tenant_id = ? ORDER BY rowid ASC").all(tenantId));
    },
    appendAuditEvent(event) {
      database.prepare("INSERT INTO audit_events (event_id, tenant_id, payload) VALUES (?, ?, ?)").run(
        event.eventId,
        event.tenantId,
        JSON.stringify(event)
      );

      return cloneState(event);
    }
  };
}
