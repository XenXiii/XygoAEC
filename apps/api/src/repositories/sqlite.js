import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { createProject } from "../../../../packages/shared-contracts/src/foundation.js";
import { createCoordinationIssue, createRfi } from "../../../../packages/coordination/src/index.js";
import { createFinding, createReviewRun, setHumanDisposition } from "../../../../packages/ai-review/src/index.js";
import { createPermitPackage } from "../../../../packages/permits/src/index.js";
import { createReviewSession } from "../../../../packages/projects/src/index.js";
import { generatePlatformBlueprint } from "../../../../packages/platform-blueprint/src/index.js";
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
