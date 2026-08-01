// Xygo — Field Reporting package (first proof package generated from a blueprint's
// `field_reporting` module). Staged/synthetic: capture placeholders only (no real
// uploads), a DETERMINISTIC AI-draft simulation (no live model), human review, and
// a client-facing gate (only approved reports are client-visible).

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is required.`);
  }
}

export const REPORT_TYPE_SET = new Set(["daily_log", "inspection", "safety", "progress"]);
export const OBSERVATION_KINDS = new Set(["note", "photo", "checklist", "voice"]);

// Statuses: captured -> draft_generated -> (in_review) -> approved | changes_requested
export const FIELD_REPORT_STATUS_SET = new Set([
  "captured",
  "draft_generated",
  "in_review",
  "approved",
  "changes_requested"
]);

const REVIEWABLE_NEXT = new Set(["in_review", "approved", "changes_requested"]);

function normalizeObservation(observation, index) {
  if (!observation || !OBSERVATION_KINDS.has(observation.kind)) {
    throw new Error(`Observation ${index} has an unknown kind.`);
  }
  switch (observation.kind) {
    case "note":
      return { kind: "note", text: String(observation.text ?? "") };
    case "photo":
      // Placeholder only — no real file. `placeholderRef` names a staged asset.
      return { kind: "photo", caption: String(observation.caption ?? ""), placeholderRef: observation.placeholderRef ?? null };
    case "checklist":
      return { kind: "checklist", label: String(observation.label ?? ""), checked: observation.checked === true };
    case "voice":
      return { kind: "voice", transcriptPlaceholder: String(observation.transcriptPlaceholder ?? "") };
    default:
      throw new Error(`Observation ${index} has an unknown kind.`);
  }
}

export function createFieldReport(input) {
  requiredString(input?.id, "Field report id");
  requiredString(input?.tenantId, "Field report tenantId");
  requiredString(input?.projectId, "Field report projectId");
  requiredString(input?.siteName, "Site name");
  requiredString(input?.reportType, "Report type");
  requiredString(input?.author, "Author");

  if (!REPORT_TYPE_SET.has(input.reportType)) {
    throw new Error(`Unknown report type: ${input.reportType}`);
  }
  if (input.staged !== true) {
    throw new Error("Field report must be staged.");
  }

  const observations = Array.isArray(input.observations)
    ? input.observations.map((observation, index) => normalizeObservation(observation, index))
    : [];

  return {
    id: input.id,
    tenantId: input.tenantId,
    projectId: input.projectId,
    siteName: input.siteName,
    reportType: input.reportType,
    author: input.author,
    capturedAt: input.capturedAt ?? null,
    observations,
    status: "captured",
    draft: null,
    reviewedBy: null,
    reviewNote: null,
    clientVisible: false,
    staged: true
  };
}

// Deterministic AI-draft SIMULATION. Assembles a formatted report from the
// captured observations. No live model call; identical input -> identical draft.
export function generateReportDraft(report) {
  if (!report || report.staged !== true) {
    throw new Error("A staged field report is required.");
  }

  const notes = report.observations.filter((o) => o.kind === "note").map((o) => o.text).filter(Boolean);
  const checklist = report.observations
    .filter((o) => o.kind === "checklist")
    .map((o) => `${o.label}: ${o.checked ? "complete" : "incomplete"}`);
  const photos = report.observations.filter((o) => o.kind === "photo").map((o) => o.caption).filter(Boolean);
  const voice = report.observations.filter((o) => o.kind === "voice").map((o) => o.transcriptPlaceholder).filter(Boolean);
  const openItems = report.observations.filter((o) => o.kind === "checklist" && o.checked !== true).length;

  const sections = [
    {
      heading: "Summary",
      body:
        `${report.reportType} report for ${report.siteName} by ${report.author}. ` +
        `${report.observations.length} observation(s); ${openItems} open checklist item(s). ` +
        `SIMULATED draft — requires human review before release.`
    },
    { heading: "Notes", items: notes },
    { heading: "Checklist", items: checklist },
    { heading: "Photos", items: photos },
    { heading: "Voice Notes", items: voice }
  ];

  const draft = {
    title: `${report.reportType} — ${report.siteName}`,
    sections,
    aiGenerated: true,
    simulated: true,
    summary: sections[0].body
  };

  return { ...report, draft, status: "draft_generated" };
}

export function setReviewStatus(report, nextStatus, { reviewedBy = null, reviewNote = null } = {}) {
  if (!report || report.staged !== true) {
    throw new Error("A staged field report is required.");
  }
  if (!REVIEWABLE_NEXT.has(nextStatus)) {
    throw new Error(`Unknown review status: ${nextStatus}`);
  }
  if (!report.draft) {
    throw new Error("A report draft must be generated before review.");
  }

  return {
    ...report,
    status: nextStatus,
    reviewedBy,
    reviewNote,
    // Client-facing gate: only approved reports are visible to the client portal.
    clientVisible: nextStatus === "approved"
  };
}

// Client-facing projection: only approved reports, stripped to what a client sees.
export function toClientView(report) {
  if (!report.clientVisible || report.status !== "approved") {
    return null;
  }
  return {
    id: report.id,
    siteName: report.siteName,
    reportType: report.reportType,
    title: report.draft?.title ?? report.siteName,
    sections: report.draft?.sections ?? [],
    status: "approved",
    staged: true
  };
}
