import {
  syntheticAiFindings,
  syntheticAiReviewRuns,
  syntheticCoordinationIssues,
  syntheticPermitPackages,
  syntheticPlatformBlueprints,
  syntheticProjects,
  syntheticReviewSessions,
  syntheticRfis
} from "../../../../packages/test-fixtures/src/synthetic-tenants.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function cloneState(state) {
  return clone(state);
}

export function createSeedState() {
  return {
    projects: clone(syntheticProjects),
    issues: clone(syntheticCoordinationIssues),
    rfis: clone(syntheticRfis),
    permitPackages: clone(syntheticPermitPackages),
    reviewSessions: clone(syntheticReviewSessions),
    aiReviewRuns: clone(syntheticAiReviewRuns),
    aiFindings: clone(syntheticAiFindings),
    platformBlueprints: clone(syntheticPlatformBlueprints),
    auditEvents: []
  };
}
