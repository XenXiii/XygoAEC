import { canAccessTenant } from "./staged-auth.js";

export function canStreamTenantEvents({ headers = {}, tenantId, searchParams = new URLSearchParams() }) {
  return canAccessTenant({ headers, searchParams, tenantId });
}

export function buildTenantEventSnapshot({ tenantId, repository }) {
  return {
    tenantId,
    projects: repository.listProjectsByTenant(tenantId).length,
    issues: repository.listIssuesByTenant(tenantId).length,
    rfis: repository.listRfisByTenant(tenantId).length,
    permitPackages: repository.listPermitPackagesByTenant(tenantId).length,
    reviewSessions: repository.listReviewSessionsByTenant(tenantId).length,
    aiReviewRuns: repository.listAiReviewRunsByTenant(tenantId).length,
    aiFindings: repository.listAiFindingsByTenant(tenantId).length,
    staged: true
  };
}

export function formatSseEvent({ event, data }) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
