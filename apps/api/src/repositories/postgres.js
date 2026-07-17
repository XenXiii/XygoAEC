import { createProject } from "../../../../packages/shared-contracts/src/foundation.js";
import { createCoordinationIssue, createRfi } from "../../../../packages/coordination/src/index.js";
import { createFinding, createReviewRun, setHumanDisposition } from "../../../../packages/ai-review/src/index.js";
import { createPermitPackage } from "../../../../packages/permits/src/index.js";
import { createReviewSession } from "../../../../packages/projects/src/index.js";
import { generatePlatformBlueprint } from "../../../../packages/platform-blueprint/src/index.js";
import { createSeedState } from "./seed.js";
import { syntheticTenants } from "../../../../packages/test-fixtures/src/synthetic-tenants.js";

// Production Postgres backend. Implements the SAME async repository contract as
// the other backends. `pg` is imported lazily so this module loads even when the
// dependency is absent (e.g. sqlite/memory-only environments and the default CI
// job); a connection is only attempted on first query. Verified in CI against a
// Postgres service (see .github/workflows/ci.yml, postgres job) — not runnable in
// the offline dev sandbox.

const MIGRATION = new URL("../../../../infrastructure/migrations/postgres/0001_init.sql", import.meta.url);

export function createPostgresRepository({ connectionString }) {
  if (!connectionString) {
    throw new Error("connectionString is required for postgres repository.");
  }

  let poolPromise = null;

  async function pool() {
    if (!poolPromise) {
      poolPromise = (async () => {
        const pg = (await import("pg")).default;
        const fs = await import("node:fs");
        const p = new pg.Pool({ connectionString });
        const sql = fs.readFileSync(MIGRATION, "utf8");
        await p.query(sql);
        await seed(p);
        return p;
      })();
    }
    return poolPromise;
  }

  async function query(text, params = []) {
    const p = await pool();
    return p.query(text, params);
  }

  async function seed(p) {
    const { rows } = await p.query("SELECT COUNT(*)::int AS count FROM projects");
    if (rows[0].count > 0) {
      return;
    }

    const state = createSeedState();
    const tenants = syntheticTenants ?? [];
    for (const tenant of tenants) {
      await p.query("INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [
        tenant.id,
        tenant.name ?? tenant.id
      ]);
    }
    // Ensure referenced tenants exist even if the fixture list is sparse.
    for (const project of state.projects) {
      await p.query("INSERT INTO tenants (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING", [project.tenantId]);
    }

    for (const row of state.projects) {
      await p.query(
        "INSERT INTO projects (id, tenant_id, name, project_type, status, payload) VALUES ($1,$2,$3,$4,$5,$6)",
        [row.id, row.tenantId, row.name, row.projectType ?? "commercial", row.status ?? "draft", row]
      );
    }
    for (const row of state.issues) {
      await p.query(
        "INSERT INTO issues (id, tenant_id, project_id, title, description, status, severity, priority, payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [row.id, row.tenantId, row.projectId, row.title, row.description, row.status, row.severity ?? "medium", row.priority ?? "medium", row]
      );
    }
    for (const row of state.rfis) {
      await p.query(
        "INSERT INTO rfis (id, tenant_id, project_id, title, question, status, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [row.id, row.tenantId, row.projectId, row.title, row.question ?? "", row.status, row]
      );
    }
    for (const row of state.permitPackages) {
      await p.query(
        "INSERT INTO permit_packages (id, tenant_id, project_id, jurisdiction_profile, status, payload) VALUES ($1,$2,$3,$4,$5,$6)",
        [row.id, row.tenantId, row.projectId, row.jurisdictionProfile, row.status, row]
      );
    }
    for (const row of state.reviewSessions) {
      await p.query(
        "INSERT INTO review_sessions (id, tenant_id, project_id, created_by, status, payload) VALUES ($1,$2,$3,$4,$5,$6)",
        [row.id, row.tenantId, row.projectId, row.createdBy, row.status, row]
      );
    }
    for (const row of state.aiReviewRuns) {
      await p.query(
        "INSERT INTO ai_review_runs (id, tenant_id, project_id, status, rule_version, model_version, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [row.id, row.tenantId, row.projectId, row.status, row.ruleVersion ?? null, row.modelVersion ?? null, row]
      );
    }
    for (const row of state.aiFindings) {
      const run = state.aiReviewRuns.find((item) => item.id === row.reviewRunId);
      await p.query(
        "INSERT INTO ai_findings (id, tenant_id, review_run_id, category, severity, human_disposition, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [row.id, run?.tenantId ?? "unknown", row.reviewRunId, row.category, row.severity ?? "medium", row.humanDisposition ?? "pending", row]
      );
    }
    for (const row of state.platformBlueprints ?? []) {
      await p.query(
        "INSERT INTO platform_blueprints (id, tenant_id, industry, payload) VALUES ($1,$2,$3,$4)",
        [row.id, row.tenantId, row.industry ?? null, row]
      );
    }
  }

  const payloads = (result) => result.rows.map((r) => r.payload);
  const one = (result) => (result.rows[0] ? result.rows[0].payload : null);

  return {
    async listProjectsByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM projects WHERE tenant_id = $1", [tenantId]));
    },
    async getProjectById(projectId) {
      return one(await query("SELECT payload FROM projects WHERE id = $1", [projectId]));
    },
    async createProject(input) {
      const project = createProject({ ...input, staged: true });
      if (one(await query("SELECT payload FROM projects WHERE id = $1", [project.id]))) {
        throw new Error("Project id already exists.");
      }
      await query(
        "INSERT INTO projects (id, tenant_id, name, project_type, status, payload) VALUES ($1,$2,$3,$4,$5,$6)",
        [project.id, project.tenantId, project.name, project.projectType, project.status, project]
      );
      return project;
    },
    async listIssuesByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM issues WHERE tenant_id = $1", [tenantId]));
    },
    async listIssuesByProject(projectId) {
      return payloads(await query("SELECT payload FROM issues WHERE project_id = $1", [projectId]));
    },
    async createIssue(input) {
      const issue = createCoordinationIssue({ ...input, staged: true });
      if (one(await query("SELECT payload FROM issues WHERE id = $1", [issue.id]))) {
        throw new Error("Coordination issue id already exists.");
      }
      await query(
        "INSERT INTO issues (id, tenant_id, project_id, title, description, status, severity, priority, payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [issue.id, issue.tenantId, issue.projectId, issue.title, issue.description, issue.status, issue.severity, issue.priority, issue]
      );
      return issue;
    },
    async listRfisByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM rfis WHERE tenant_id = $1", [tenantId]));
    },
    async createRfi(input) {
      const rfi = createRfi({ ...input, staged: true });
      if (one(await query("SELECT payload FROM rfis WHERE id = $1", [rfi.id]))) {
        throw new Error("RFI id already exists.");
      }
      await query(
        "INSERT INTO rfis (id, tenant_id, project_id, title, question, status, payload) VALUES ($1,$2,$3,$4,$5,$6)",
        [rfi.id, rfi.tenantId, rfi.projectId, rfi.title, rfi.question, rfi.status, rfi]
      );
      return rfi;
    },
    async listPermitPackagesByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM permit_packages WHERE tenant_id = $1", [tenantId]));
    },
    async createPermitPackage(input) {
      const permitPackage = createPermitPackage({ ...input, staged: true });
      if (one(await query("SELECT payload FROM permit_packages WHERE id = $1", [permitPackage.id]))) {
        throw new Error("Permit package id already exists.");
      }
      await query(
        "INSERT INTO permit_packages (id, tenant_id, project_id, jurisdiction_profile, status, payload) VALUES ($1,$2,$3,$4,$5,$6)",
        [permitPackage.id, permitPackage.tenantId, permitPackage.projectId, permitPackage.jurisdictionProfile, permitPackage.status, permitPackage]
      );
      return permitPackage;
    },
    async listReviewSessionsByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM review_sessions WHERE tenant_id = $1", [tenantId]));
    },
    async createReviewSession(input) {
      const reviewSession = createReviewSession({ ...input, staged: true });
      if (one(await query("SELECT payload FROM review_sessions WHERE id = $1", [reviewSession.id]))) {
        throw new Error("Review session id already exists.");
      }
      await query(
        "INSERT INTO review_sessions (id, tenant_id, project_id, created_by, status, payload) VALUES ($1,$2,$3,$4,$5,$6)",
        [reviewSession.id, reviewSession.tenantId, reviewSession.projectId, reviewSession.createdBy, reviewSession.status, reviewSession]
      );
      return reviewSession;
    },
    async listAiReviewRunsByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM ai_review_runs WHERE tenant_id = $1", [tenantId]));
    },
    async getAiReviewRunById(reviewRunId) {
      return one(await query("SELECT payload FROM ai_review_runs WHERE id = $1", [reviewRunId]));
    },
    async createAiReviewRun(input) {
      const reviewRun = createReviewRun({ ...input, staged: true });
      if (one(await query("SELECT payload FROM ai_review_runs WHERE id = $1", [reviewRun.id]))) {
        throw new Error("AI review run id already exists.");
      }
      await query(
        "INSERT INTO ai_review_runs (id, tenant_id, project_id, status, rule_version, model_version, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [reviewRun.id, reviewRun.tenantId, reviewRun.projectId, reviewRun.status, reviewRun.ruleVersion ?? null, reviewRun.modelVersion ?? null, reviewRun]
      );
      return reviewRun;
    },
    async listAiFindingsByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM ai_findings WHERE tenant_id = $1", [tenantId]));
    },
    async getAiFindingById(findingId) {
      return one(await query("SELECT payload FROM ai_findings WHERE id = $1", [findingId]));
    },
    async createAiFinding(input) {
      const run = await this.getAiReviewRunById(input.reviewRunId);
      const finding = createFinding({ ...input, staged: true });
      if (one(await query("SELECT payload FROM ai_findings WHERE id = $1", [finding.id]))) {
        throw new Error("AI finding id already exists.");
      }
      await query(
        "INSERT INTO ai_findings (id, tenant_id, review_run_id, category, severity, human_disposition, payload) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [finding.id, run?.tenantId ?? "unknown", finding.reviewRunId, finding.category, finding.severity, finding.humanDisposition, finding]
      );
      return finding;
    },
    async setAiFindingDisposition({ findingId, nextDisposition, relatedIssueId = null }) {
      const finding = await this.getAiFindingById(findingId);
      if (!finding) {
        throw new Error("AI finding not found.");
      }
      const updatedFinding = setHumanDisposition({ session: null, finding, nextDisposition, relatedIssueId });
      await query(
        "UPDATE ai_findings SET human_disposition = $1, related_issue_id = $2, payload = $3 WHERE id = $4",
        [updatedFinding.humanDisposition, updatedFinding.relatedIssueId ?? null, updatedFinding, findingId]
      );
      return updatedFinding;
    },
    async listPlatformBlueprintsByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM platform_blueprints WHERE tenant_id = $1", [tenantId]));
    },
    async getPlatformBlueprintById(blueprintId) {
      return one(await query("SELECT payload FROM platform_blueprints WHERE id = $1", [blueprintId]));
    },
    async createPlatformBlueprint(input) {
      const blueprint = generatePlatformBlueprint({ ...input, staged: true });
      if (one(await query("SELECT payload FROM platform_blueprints WHERE id = $1", [blueprint.id]))) {
        throw new Error("Platform blueprint id already exists.");
      }
      await query(
        "INSERT INTO platform_blueprints (id, tenant_id, industry, payload) VALUES ($1,$2,$3,$4)",
        [blueprint.id, blueprint.tenantId, blueprint.industry ?? null, blueprint]
      );
      return blueprint;
    },
    async listAuditEventsByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM audit_events WHERE tenant_id = $1 ORDER BY seq ASC", [tenantId]));
    },
    async appendAuditEvent(event) {
      await query(
        "INSERT INTO audit_events (event_id, tenant_id, action, resource_type, resource_id, previous_hash, event_hash, signature, payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [event.eventId, event.tenantId, event.action, event.resourceType, event.resourceId, event.previousHash ?? null, event.eventHash, event.signature ?? null, event]
      );
      return event;
    },
    async close() {
      if (poolPromise) {
        const p = await poolPromise;
        await p.end();
        poolPromise = null;
      }
    }
  };
}
