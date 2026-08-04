// Xygo — Client Portal package (Phase 4 proof package). A READ-ONLY, client-facing
// projection composed from existing data: project status, approved field reports,
// files, updates/messages, and a STAGED payment placeholder. No writes, no live
// billing — the payment block is always a non-actionable staged placeholder.

// Staged payment placeholder. There is deliberately no amount owed and no action:
// billing is not connected and must never imply a live charge.
export function paymentPlaceholder() {
  return {
    status: "staged_no_billing",
    balanceDue: null,
    currency: null,
    note: "Payments are staged and simulated. No live billing is connected.",
    staged: true
  };
}

export function buildClientPortalView({ project, approvedReports = [], files = [], updates = [] }) {
  if (!project) {
    throw new Error("Client portal requires a project.");
  }

  return {
    tenantId: project.tenantId,
    projectId: project.id,
    projectName: project.name,
    projectStatus: project.status ?? "unknown",
    // approvedReports are already client-facing projections (approved only).
    reports: approvedReports,
    files: files.map((file) => ({
      id: file.id,
      name: file.originalFilename ?? file.name ?? file.id,
      fileClass: file.fileClass ?? "document",
      mimeType: file.mimeType ?? null,
      sizeBytes: file.sizeBytes ?? null,
      downloadPath: `/v1/tenants/${encodeURIComponent(project.tenantId)}/files/${encodeURIComponent(file.id)}/download`
    })),
    updates: [...updates]
      .sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")))
      .map((update) => ({ id: update.id, at: update.at ?? null, message: update.message })),
    payment: paymentPlaceholder(),
    staged: true
  };
}
