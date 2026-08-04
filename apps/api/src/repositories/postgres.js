import crypto from "node:crypto";

import { createProject } from "../../../../packages/shared-contracts/src/foundation.js";
import { createCoordinationIssue, createRfi } from "../../../../packages/coordination/src/index.js";
import { createFinding, createReviewRun, setHumanDisposition } from "../../../../packages/ai-review/src/index.js";
import { createPermitPackage } from "../../../../packages/permits/src/index.js";
import { createReviewSession } from "../../../../packages/projects/src/index.js";
import { generatePlatformBlueprint } from "../../../../packages/platform-blueprint/src/index.js";
import { createFieldReport } from "../../../../packages/field-reporting/src/index.js";
import { createAuditEvent } from "../../../../packages/audit/src/foundation.js";
import { buildStagedTenantProvisioning } from "../../../../packages/activation/src/provision-tenant.js";
import { createSeedState } from "./seed.js";
import { syntheticTenants } from "../../../../packages/test-fixtures/src/synthetic-tenants.js";
import { applyPostgresMigrations } from "./postgres-migrations.js";

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function managedOidcIssuer(value) {
  const issuer = requiredString(value, "issuer");
  let url;
  try {
    url = new URL(issuer);
  } catch {
    throw new Error("issuer must be an absolute HTTPS URL.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
    throw new Error("issuer must be an HTTPS URL without credentials, query parameters, or a fragment.");
  }
  return issuer;
}

function oidcBindingConflict(message) {
  const error = new Error(message);
  error.code = "oidc_binding_conflict";
  return error;
}

// Production Postgres backend. Implements the SAME async repository contract as
// the other backends. `pg` is imported lazily so this module loads even when the
// dependency is absent (e.g. sqlite/memory-only environments and the default CI
// job); a connection is only attempted on first query. Verified in CI against a
// Postgres service (see .github/workflows/ci.yml, postgres job) — not runnable in
// the offline dev sandbox.

export async function runPostgresTransaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      error.rollbackError = rollbackError;
    }
    throw error;
  } finally {
    client.release();
  }
}

export function createPostgresRepository({
  connectionString,
  auditSigningKey = null,
  beforeProvisioningCommit = null,
  beforeOidcBindingCommit = null
}) {
  if (!connectionString) {
    throw new Error("connectionString is required for postgres repository.");
  }

  let poolPromise = null;

  async function pool() {
    if (!poolPromise) {
      poolPromise = (async () => {
        const pg = (await import("pg")).default;
        const p = new pg.Pool({ connectionString });
        await applyPostgresMigrations(p);
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
        [row.id, row.tenantId, row.projectId, row.createdBy, row.status ?? "open", row]
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
    for (const row of state.fieldReports ?? []) {
      await p.query(
        "INSERT INTO field_reports (id, tenant_id, project_id, status, payload) VALUES ($1,$2,$3,$4,$5)",
        [row.id, row.tenantId, row.projectId ?? null, row.status, row]
      );
    }
  }

  const payloads = (result) => result.rows.map((r) => r.payload);
  const one = (result) => (result.rows[0] ? result.rows[0].payload : null);

  async function readProvisionedTenant(client, tenantId) {
    const scopedPayloads = async (table) =>
      payloads(await client.query(`SELECT payload FROM ${table} WHERE tenant_id = $1 ORDER BY id`, [tenantId]));
    return {
      tenant: one(await client.query("SELECT payload FROM tenants WHERE id = $1", [tenantId])),
      users: await scopedPayloads("users"),
      roleAssignments: await scopedPayloads("role_assignments"),
      oidcIdentities: await scopedPayloads("oidc_identities"),
      businessProfile: one(await client.query("SELECT payload FROM business_profiles WHERE tenant_id = $1", [tenantId])),
      project: one(await client.query("SELECT payload FROM projects WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [tenantId])),
      blueprint: one(await client.query("SELECT payload FROM platform_blueprints WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [tenantId])),
      portalConfiguration: one(await client.query("SELECT payload FROM portal_configurations WHERE tenant_id = $1", [tenantId])),
      portalData: one(await client.query("SELECT payload FROM portal_data WHERE tenant_id = $1", [tenantId])),
      provisioningEvent: one(await client.query("SELECT payload FROM provisioning_events WHERE tenant_id = $1 ORDER BY created_at LIMIT 1", [tenantId]))
    };
  }

  return {
    async provisionStagedTenant(input) {
      const records = buildStagedTenantProvisioning(input);
      const tenantId = records.tenant.id;
      const p = await pool();

      return runPostgresTransaction(p, async (client) => {
        // Serialize same-tenant attempts, including the first insert where no row
        // exists yet. This preserves idempotency under concurrent admin commands.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [tenantId]);
        const existing = await client.query(
          "SELECT provisioning_key FROM tenants WHERE id = $1",
          [tenantId]
        );
        if (existing.rows[0]) {
          if (existing.rows[0].provisioning_key !== records.provisioningKey) {
            throw new Error(`Tenant ${tenantId} already exists with different provisioning input.`);
          }
          return { created: false, ...(await readProvisionedTenant(client, tenantId)) };
        }

        await client.query(
          "INSERT INTO tenants (id, name, status, staged, provisioning_key, payload, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [tenantId, records.tenant.name, records.tenant.status, true, records.provisioningKey, records.tenant, records.tenant.createdAt]
        );
        for (const user of records.users) {
          await client.query(
            "INSERT INTO users (id, tenant_id, email, display_name, status, payload) VALUES ($1,$2,$3,$4,$5,$6)",
            [user.id, tenantId, user.email, user.displayName, user.status, user]
          );
        }
        for (const assignment of records.roleAssignments) {
          await client.query(
            "INSERT INTO role_assignments (id, tenant_id, user_id, role, payload) VALUES ($1,$2,$3,$4,$5)",
            [assignment.id, tenantId, assignment.userId, assignment.role, assignment]
          );
        }
        for (const identity of records.oidcIdentities) {
          await client.query(
            "INSERT INTO oidc_identities (id, issuer, subject, tenant_id, user_id, payload) VALUES ($1,$2,$3,$4,$5,$6)",
            [identity.id, identity.issuer, identity.subject, tenantId, identity.userId, identity]
          );
        }
        await client.query(
          "INSERT INTO business_profiles (id, tenant_id, legal_name, service_line, payload) VALUES ($1,$2,$3,$4,$5)",
          [records.businessProfile.id, tenantId, records.businessProfile.legalName, records.businessProfile.serviceLine, records.businessProfile]
        );
        await client.query(
          "INSERT INTO projects (id, tenant_id, name, project_type, status, payload) VALUES ($1,$2,$3,$4,$5,$6)",
          [records.project.id, tenantId, records.project.name, records.project.projectType, records.project.status, records.project]
        );
        await client.query(
          "INSERT INTO platform_blueprints (id, tenant_id, industry, payload) VALUES ($1,$2,$3,$4)",
          [records.blueprint.id, tenantId, records.blueprint.industry, records.blueprint]
        );
        await client.query(
          "INSERT INTO portal_configurations (id, tenant_id, brand_name, primary_color, approved_content_only, payload) VALUES ($1,$2,$3,$4,$5,$6)",
          [records.portalConfiguration.id, tenantId, records.portalConfiguration.brandName, records.portalConfiguration.primaryColor, true, records.portalConfiguration]
        );
        await client.query(
          "INSERT INTO portal_data (id, tenant_id, project_id, payload) VALUES ($1,$2,$3,$4)",
          [records.portalData.id, tenantId, records.portalData.projectId, records.portalData]
        );
        await client.query(
          "INSERT INTO provisioning_events (id, tenant_id, action, payload, created_at) VALUES ($1,$2,$3,$4,$5)",
          [records.provisioningEvent.id, tenantId, records.provisioningEvent.action, records.provisioningEvent, records.provisioningEvent.createdAt]
        );

        const previousAudit = await client.query(
          "SELECT payload FROM audit_events WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1",
          [tenantId]
        );
        const auditEvent = createAuditEvent({
          eventId: `${tenantId}-provisioning-audit`,
          tenantId,
          actorType: "system",
          actorId: "tenant-provisioner",
          action: "staged_tenant.provisioned",
          resourceType: "tenant",
          resourceId: tenantId,
          afterStateRef: records.provisioningEvent.id,
          correlationId: records.provisioningEvent.id,
          requestId: records.provisioningEvent.id,
          timestamp: records.provisioningEvent.createdAt,
          previousHash: previousAudit.rows[0]?.payload?.eventHash ?? null,
          signingKey: auditSigningKey
        });
        await client.query(
          "INSERT INTO audit_events (event_id, tenant_id, action, resource_type, resource_id, previous_hash, event_hash, signature, payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [auditEvent.eventId, tenantId, auditEvent.action, auditEvent.resourceType, auditEvent.resourceId, auditEvent.previousHash, auditEvent.eventHash, auditEvent.signature ?? null, auditEvent]
        );

        if (beforeProvisioningCommit) {
          await beforeProvisioningCommit({ client, records });
        }

        return {
          created: true,
          tenant: records.tenant,
          users: records.users,
          roleAssignments: records.roleAssignments,
          oidcIdentities: records.oidcIdentities,
          businessProfile: records.businessProfile,
          project: records.project,
          blueprint: records.blueprint,
          portalConfiguration: records.portalConfiguration,
          portalData: records.portalData,
          provisioningEvent: records.provisioningEvent
        };
      });
    },
    async getTenantById(tenantId) {
      return one(await query("SELECT payload FROM tenants WHERE id = $1", [tenantId]));
    },
    async listUsersByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM users WHERE tenant_id = $1 ORDER BY id", [tenantId]));
    },
    async listRoleAssignmentsByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM role_assignments WHERE tenant_id = $1 ORDER BY id", [tenantId]));
    },
    async listOidcIdentitiesByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM oidc_identities WHERE tenant_id = $1 ORDER BY id", [tenantId]));
    },
    async bindOidcIdentity(input) {
      const tenantId = requiredString(input?.tenantId, "tenantId");
      const email = requiredString(input?.email, "email").toLowerCase();
      const issuer = managedOidcIssuer(input?.issuer);
      const subject = requiredString(input?.subject, "subject");
      const actorId = requiredString(input?.actorId, "actorId");
      const p = await pool();

      return runPostgresTransaction(p, async (client) => {
        // Serialize all contenders for either side of the one-to-one binding.
        // Sorting the lock keys keeps concurrent cross-bind attempts deadlock-safe.
        const lockKeys = [`oidc-email:${tenantId}:${email}`, `oidc-subject:${issuer}:${subject}`].sort();
        for (const lockKey of lockKeys) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [lockKey]);
        }

        const userResult = await client.query(
          "SELECT u.id, u.tenant_id, u.email, u.status, t.status AS tenant_status, r.role " +
            "FROM users u " +
            "JOIN tenants t ON t.id = u.tenant_id " +
            "JOIN role_assignments r ON r.user_id = u.id AND r.tenant_id = u.tenant_id " +
            "WHERE u.tenant_id = $1 AND lower(u.email) = $2",
          [tenantId, email]
        );
        if (userResult.rows.length === 0) {
          throw new Error(`No provisioned user ${email} exists in tenant ${tenantId}.`);
        }
        if (userResult.rows.length !== 1) {
          throw oidcBindingConflict(`Provisioned user ${email} has an ambiguous role assignment.`);
        }
        const user = userResult.rows[0];
        if (user.status !== "active" || user.tenant_status !== "active") {
          throw new Error("OIDC identities can only be bound to active users in active tenants.");
        }

        const existing = await client.query(
          "SELECT id, issuer, subject, tenant_id, user_id, payload FROM oidc_identities " +
            "WHERE (tenant_id = $1 AND user_id = $2) OR (issuer = $3 AND subject = $4) FOR UPDATE",
          [tenantId, user.id, issuer, subject]
        );
        const exact = existing.rows.find((row) =>
          row.tenant_id === tenantId && row.user_id === user.id && row.issuer === issuer && row.subject === subject
        );
        if (exact && existing.rows.length === 1) {
          return { created: false, identity: exact.payload };
        }
        if (existing.rows.length > 0) {
          throw oidcBindingConflict(
            "OIDC subject or provisioned user is already bound to a different canonical identity."
          );
        }

        const boundAt = new Date().toISOString();
        const identityId = `oidc-${crypto.createHash("sha256").update(`${issuer}\0${subject}`).digest("hex").slice(0, 32)}`;
        const identity = {
          id: identityId,
          tenantId,
          userId: user.id,
          issuer,
          subject,
          bindingSource: "managed-idp-admin",
          boundAt,
          staged: true
        };
        await client.query(
          "INSERT INTO oidc_identities (id, issuer, subject, tenant_id, user_id, payload) VALUES ($1,$2,$3,$4,$5,$6)",
          [identity.id, issuer, subject, tenantId, user.id, identity]
        );

        // Bindings are authorization changes. Record them in the same transaction
        // and extend the tenant audit chain before making the identity usable.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`audit:${tenantId}`]);
        const previousAudit = await client.query(
          "SELECT payload FROM audit_events WHERE tenant_id = $1 ORDER BY seq DESC LIMIT 1",
          [tenantId]
        );
        const auditEvent = createAuditEvent({
          eventId: `${identity.id}-bound-audit`,
          tenantId,
          actorType: "user",
          actorId,
          action: "managed_idp.identity_bound",
          resourceType: "oidc_identity",
          resourceId: identity.id,
          afterStateRef: { userId: user.id, issuer },
          correlationId: identity.id,
          requestId: identity.id,
          timestamp: boundAt,
          previousHash: previousAudit.rows[0]?.payload?.eventHash ?? null,
          signingKey: auditSigningKey
        });
        await client.query(
          "INSERT INTO audit_events (event_id, tenant_id, action, resource_type, resource_id, previous_hash, event_hash, signature, payload) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [auditEvent.eventId, tenantId, auditEvent.action, auditEvent.resourceType, auditEvent.resourceId, auditEvent.previousHash, auditEvent.eventHash, auditEvent.signature ?? null, auditEvent]
        );

        if (beforeOidcBindingCommit) {
          await beforeOidcBindingCommit({ client, identity, auditEvent });
        }

        return { created: true, identity };
      });
    },
    async resolveOidcAuthorization({ issuer, subject }) {
      const result = await query(
        "SELECT i.user_id, i.tenant_id, r.role " +
          "FROM oidc_identities i " +
          "JOIN users u ON u.id = i.user_id AND u.tenant_id = i.tenant_id " +
          "JOIN tenants t ON t.id = i.tenant_id " +
          "JOIN role_assignments r ON r.user_id = i.user_id AND r.tenant_id = i.tenant_id " +
          "WHERE i.issuer = $1 AND i.subject = $2 AND u.status = 'active' AND t.status = 'active'",
        [issuer, subject]
      );
      if (result.rows.length === 0) return { status: "not_found" };
      if (result.rows.length !== 1) return { status: "ambiguous" };
      const row = result.rows[0];
      return {
        status: "active",
        userId: row.user_id,
        tenantId: row.tenant_id,
        organizationRole: row.role,
        projectRole: null
      };
    },
    async getBusinessProfileByTenant(tenantId) {
      return one(await query("SELECT payload FROM business_profiles WHERE tenant_id = $1", [tenantId]));
    },
    async getPortalConfigurationByTenant(tenantId) {
      return one(await query("SELECT payload FROM portal_configurations WHERE tenant_id = $1", [tenantId]));
    },
    async getPortalDataByTenant(tenantId) {
      return one(await query("SELECT payload FROM portal_data WHERE tenant_id = $1", [tenantId]));
    },
    async listProvisioningEventsByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM provisioning_events WHERE tenant_id = $1 ORDER BY created_at", [tenantId]));
    },
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
    async listFieldReportsByTenant(tenantId) {
      return payloads(await query("SELECT payload FROM field_reports WHERE tenant_id = $1", [tenantId]));
    },
    async getFieldReportById(reportId) {
      return one(await query("SELECT payload FROM field_reports WHERE id = $1", [reportId]));
    },
    async createFieldReport(input) {
      const report = createFieldReport({ ...input, staged: true });
      if (one(await query("SELECT payload FROM field_reports WHERE id = $1", [report.id]))) {
        throw new Error("Field report id already exists.");
      }
      await query(
        "INSERT INTO field_reports (id, tenant_id, project_id, status, payload) VALUES ($1,$2,$3,$4,$5)",
        [report.id, report.tenantId, report.projectId ?? null, report.status, report]
      );
      return report;
    },
    async saveFieldReport(report) {
      await query(
        "INSERT INTO field_reports (id, tenant_id, project_id, status, payload) VALUES ($1,$2,$3,$4,$5) " +
          "ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, project_id = EXCLUDED.project_id, status = EXCLUDED.status, payload = EXCLUDED.payload",
        [report.id, report.tenantId, report.projectId ?? null, report.status, report]
      );
      return report;
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
