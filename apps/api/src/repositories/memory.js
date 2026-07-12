import { createProject } from "../../../../packages/shared-contracts/src/foundation.js";
import { createCoordinationIssue, createRfi } from "../../../../packages/coordination/src/index.js";
import { createFinding, createReviewRun, setHumanDisposition } from "../../../../packages/ai-review/src/index.js";
import { createPermitPackage } from "../../../../packages/permits/src/index.js";
import { createReviewSession } from "../../../../packages/projects/src/index.js";
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
    listAuditEventsByTenant(tenantId) {
      return auditEventStore.filter((event) => event.tenantId === tenantId).map((event) => clone(event));
    },
    appendAuditEvent(event) {
      auditEventStore.push(clone(event));
      return clone(event);
    }
  };
}
