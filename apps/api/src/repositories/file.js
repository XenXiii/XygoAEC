import fs from "node:fs";
import path from "node:path";

import { createProject } from "../../../../packages/shared-contracts/src/foundation.js";
import { createCoordinationIssue, createRfi } from "../../../../packages/coordination/src/index.js";
import { createFinding, createReviewRun, setHumanDisposition } from "../../../../packages/ai-review/src/index.js";
import { createPermitPackage } from "../../../../packages/permits/src/index.js";
import { createReviewSession } from "../../../../packages/projects/src/index.js";
import { generatePlatformBlueprint } from "../../../../packages/platform-blueprint/src/index.js";
import { cloneState, createSeedState } from "./seed.js";

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readState(filePath) {
  if (!fs.existsSync(filePath)) {
    return createSeedState();
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeState(filePath, state) {
  ensureDirectory(filePath);

  // Atomic write: serialize into a sibling temp file, then rename over the target.
  // fs.writeFileSync truncates-then-writes in place, so a crash or a concurrent
  // reader mid-write could observe a torn / partially-written store. rename() on
  // the same filesystem is atomic, so readers always see either the old or the new
  // complete file. The pid-scoped temp name keeps concurrent writers from clobbering
  // each other's in-flight temp file.
  const tempPath = `${filePath}.${process.pid}.tmp`;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
    throw error;
  }
}

function listByTenant(items, tenantId) {
  return items.filter((item) => item.tenantId === tenantId);
}

function replaceById(items, nextItem) {
  return items.map((item) => (item.id === nextItem.id ? nextItem : item));
}

export function createFileRepository({ filePath }) {
  if (!filePath) {
    throw new Error("filePath is required for file repository.");
  }

  if (!fs.existsSync(filePath)) {
    writeState(filePath, createSeedState());
  }

  return {
    filePath,
    listProjectsByTenant(tenantId) {
      return listByTenant(readState(filePath).projects, tenantId);
    },
    getProjectById(projectId) {
      return readState(filePath).projects.find((project) => project.id === projectId) ?? null;
    },
    createProject(input) {
      const state = readState(filePath);
      const project = createProject({
        ...input,
        staged: true
      });

      if (state.projects.some((item) => item.id === project.id)) {
        throw new Error("Project id already exists.");
      }

      state.projects.push(project);
      writeState(filePath, state);
      return cloneState(project);
    },
    listIssuesByTenant(tenantId) {
      return listByTenant(readState(filePath).issues, tenantId);
    },
    listIssuesByProject(projectId) {
      return readState(filePath).issues.filter((issue) => issue.projectId === projectId);
    },
    createIssue(input) {
      const state = readState(filePath);
      const issue = createCoordinationIssue({
        ...input,
        staged: true
      });

      if (state.issues.some((item) => item.id === issue.id)) {
        throw new Error("Coordination issue id already exists.");
      }

      state.issues.push(issue);
      writeState(filePath, state);
      return cloneState(issue);
    },
    listRfisByTenant(tenantId) {
      return listByTenant(readState(filePath).rfis, tenantId);
    },
    createRfi(input) {
      const state = readState(filePath);
      const rfi = createRfi({
        ...input,
        staged: true
      });

      if (state.rfis.some((item) => item.id === rfi.id)) {
        throw new Error("RFI id already exists.");
      }

      state.rfis.push(rfi);
      writeState(filePath, state);
      return cloneState(rfi);
    },
    listPermitPackagesByTenant(tenantId) {
      return listByTenant(readState(filePath).permitPackages, tenantId);
    },
    createPermitPackage(input) {
      const state = readState(filePath);
      const permitPackage = createPermitPackage({
        ...input,
        staged: true
      });

      if (state.permitPackages.some((item) => item.id === permitPackage.id)) {
        throw new Error("Permit package id already exists.");
      }

      state.permitPackages.push(permitPackage);
      writeState(filePath, state);
      return cloneState(permitPackage);
    },
    listReviewSessionsByTenant(tenantId) {
      return listByTenant(readState(filePath).reviewSessions, tenantId);
    },
    createReviewSession(input) {
      const state = readState(filePath);
      const reviewSession = createReviewSession({
        ...input,
        staged: true
      });

      if (state.reviewSessions.some((item) => item.id === reviewSession.id)) {
        throw new Error("Review session id already exists.");
      }

      state.reviewSessions.push(reviewSession);
      writeState(filePath, state);
      return cloneState(reviewSession);
    },
    listAiReviewRunsByTenant(tenantId) {
      return listByTenant(readState(filePath).aiReviewRuns, tenantId);
    },
    getAiReviewRunById(reviewRunId) {
      return readState(filePath).aiReviewRuns.find((reviewRun) => reviewRun.id === reviewRunId) ?? null;
    },
    createAiReviewRun(input) {
      const state = readState(filePath);
      const reviewRun = createReviewRun({
        ...input,
        staged: true
      });

      if (state.aiReviewRuns.some((item) => item.id === reviewRun.id)) {
        throw new Error("AI review run id already exists.");
      }

      state.aiReviewRuns.push(reviewRun);
      writeState(filePath, state);
      return cloneState(reviewRun);
    },
    listAiFindingsByTenant(tenantId) {
      const state = readState(filePath);
      return state.aiFindings.filter((finding) => {
        const reviewRun = state.aiReviewRuns.find((item) => item.id === finding.reviewRunId);
        return reviewRun?.tenantId === tenantId;
      });
    },
    getAiFindingById(findingId) {
      return readState(filePath).aiFindings.find((finding) => finding.id === findingId) ?? null;
    },
    createAiFinding(input) {
      const state = readState(filePath);
      const finding = createFinding({
        ...input,
        staged: true
      });

      if (state.aiFindings.some((item) => item.id === finding.id)) {
        throw new Error("AI finding id already exists.");
      }

      state.aiFindings.push(finding);
      writeState(filePath, state);
      return cloneState(finding);
    },
    setAiFindingDisposition({ findingId, nextDisposition, relatedIssueId = null }) {
      const state = readState(filePath);
      const finding = state.aiFindings.find((item) => item.id === findingId);

      if (!finding) {
        throw new Error("AI finding not found.");
      }

      const updatedFinding = setHumanDisposition({
        session: null,
        finding,
        nextDisposition,
        relatedIssueId
      });

      state.aiFindings = replaceById(state.aiFindings, updatedFinding);
      writeState(filePath, state);
      return cloneState(updatedFinding);
    },
    listPlatformBlueprintsByTenant(tenantId) {
      return listByTenant(readState(filePath).platformBlueprints ?? [], tenantId);
    },
    getPlatformBlueprintById(blueprintId) {
      return (readState(filePath).platformBlueprints ?? []).find((blueprint) => blueprint.id === blueprintId) ?? null;
    },
    createPlatformBlueprint(input) {
      const state = readState(filePath);
      const blueprint = generatePlatformBlueprint({ ...input, staged: true });

      if (!Array.isArray(state.platformBlueprints)) {
        state.platformBlueprints = [];
      }
      if (state.platformBlueprints.some((item) => item.id === blueprint.id)) {
        throw new Error("Platform blueprint id already exists.");
      }

      state.platformBlueprints.push(blueprint);
      writeState(filePath, state);
      return cloneState(blueprint);
    },
    listAuditEventsByTenant(tenantId) {
      return readState(filePath).auditEvents.filter((event) => event.tenantId === tenantId);
    },
    appendAuditEvent(event) {
      const state = readState(filePath);
      state.auditEvents.push(event);
      writeState(filePath, state);
      return cloneState(event);
    }
  };
}
