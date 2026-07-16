const tenantSelect = document.querySelector("#tenant-select");
const apiBaseUrlInput = document.querySelector("#api-base-url");
const workspaceControls = document.querySelector("#workspace-controls");
const packageList = document.querySelector("#package-list");
const sheetList = document.querySelector("#sheet-list");
const findingList = document.querySelector("#finding-list");
const metadataGrid = document.querySelector("#metadata-grid");
const workspaceStatus = document.querySelector("#workspace-status");
const projectName = document.querySelector("#project-name");
const packageStatus = document.querySelector("#package-status");
const reviewSessionState = document.querySelector("#review-session-state");
const workflowState = document.querySelector("#workflow-state");
const sheetNumber = document.querySelector("#sheet-number");
const blueprintTitle = document.querySelector("#blueprint-title");
const blueprintCaption = document.querySelector("#blueprint-caption");
const blueprintCallouts = document.querySelector("#blueprint-callouts");
const roomLabelA = document.querySelector("#room-label-a");
const roomLabelB = document.querySelector("#room-label-b");
const roomLabelC = document.querySelector("#room-label-c");
const conversionForm = document.querySelector("#conversion-form");
const conversionStatus = document.querySelector("#conversion-status");
const issueTitleInput = document.querySelector("#issue-title");
const issueDisciplineInput = document.querySelector("#issue-discipline");
const issueSeverityInput = document.querySelector("#issue-severity");
const packageTemplate = document.querySelector("#package-template");
const sheetTemplate = document.querySelector("#sheet-template");
const findingTemplate = document.querySelector("#finding-template");

const state = {
  workspace: null,
  selectedPackageId: null,
  selectedSheetId: null,
  selectedFindingId: null
};

function headers() {
  return {
    "content-type": "application/json",
    "x-staged-tenant-id": tenantSelect.value,
    "x-staged-user-id": "user-commercial-admin"
  };
}

async function getJson(url) {
  const response = await fetch(url, { headers: headers() });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with ${response.status}`);
  }

  return payload;
}

function currentPackage() {
  return state.workspace?.packages.find((item) => item.id === state.selectedPackageId) ?? null;
}

function currentSheet() {
  return state.workspace?.sheets.find((item) => item.id === state.selectedSheetId) ?? null;
}

function currentFindings() {
  const sheet = currentSheet();
  const reviewRuns = state.workspace?.reviewRuns.filter((run) => run.artifactId === sheet?.id) ?? [];
  return state.workspace?.findings.filter((finding) => reviewRuns.some((run) => run.id === finding.reviewRunId)) ?? [];
}

function currentFinding() {
  return currentFindings().find((finding) => finding.id === state.selectedFindingId) ?? null;
}

function setWorkspaceStatus(message, tone = "neutral") {
  workspaceStatus.textContent = message;
  workspaceStatus.className = `state-box${tone === "error" ? " error" : ""}`;
}

function renderPackages() {
  packageList.innerHTML = "";

  for (const item of state.workspace?.packages ?? []) {
    const element = packageTemplate.content.firstElementChild.cloneNode(true);
    element.classList.toggle("active", item.id === state.selectedPackageId);
    element.querySelector(".list-kicker").textContent = "Package";
    element.querySelector(".list-title").textContent = item.name;
    element.querySelector(".list-meta").textContent = `${item.sheetCount} sheet(s) · ${item.status.replaceAll("_", " ")}`;
    element.addEventListener("click", () => {
      state.selectedPackageId = item.id;
      const firstSheet = (state.workspace?.sheets ?? []).find((sheet) => sheet.packageId === item.id);
      state.selectedSheetId = firstSheet?.id ?? null;
      state.selectedFindingId = null;
      render();
    });
    packageList.appendChild(element);
  }
}

function renderSheets() {
  sheetList.innerHTML = "";
  const sheets = (state.workspace?.sheets ?? []).filter((sheet) => sheet.packageId === state.selectedPackageId);

  for (const item of sheets) {
    const element = sheetTemplate.content.firstElementChild.cloneNode(true);
    element.classList.toggle("active", item.id === state.selectedSheetId);
    element.querySelector(".list-kicker").textContent = item.discipline;
    element.querySelector(".list-title").textContent = `${item.sheetNumber} · ${item.sheetTitle}`;
    element.querySelector(".list-meta").textContent = `${item.sourceFormat.toUpperCase()} · ${item.revision ?? "A"} · ${item.aiReviewStatus ?? "pending"}`;
    element.addEventListener("click", () => {
      state.selectedSheetId = item.id;
      state.selectedFindingId = null;
      render();
    });
    sheetList.appendChild(element);
  }
}

function renderMetadata() {
  metadataGrid.innerHTML = "";
  const sheet = currentSheet();
  const data = [
    ["Sheet Number", sheet?.sheetNumber ?? "--"],
    ["Title", sheet?.sheetTitle ?? "--"],
    ["Discipline", sheet?.discipline ?? "--"],
    ["Source Format", sheet?.sourceFormat?.toUpperCase() ?? "--"],
    ["Revision", sheet?.revision ?? "A"],
    ["AI Review Status", sheet?.aiReviewStatus ?? "pending"]
  ];

  for (const [label, value] of data) {
    const card = document.createElement("article");
    card.className = "meta-card";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.textContent = value;
    card.append(labelEl, valueEl);
    metadataGrid.appendChild(card);
  }

  sheetNumber.textContent = sheet?.sheetNumber ?? "--";
}

function renderBlueprintDetail() {
  const sheet = currentSheet();
  const pkg = currentPackage();
  const findings = currentFindings();
  const reviewRun = state.workspace?.reviewRuns.find((run) => run.artifactId === sheet?.id);
  const permit = state.workspace?.permits.find((item) => (item.submissionPackageRefs ?? []).includes(`drawing:${sheet?.id}`));

  blueprintCallouts.innerHTML = "";

  if (!sheet) {
    blueprintTitle.textContent = "Awaiting sheet selection";
    blueprintCaption.textContent = "Select a package and sheet to render staged blueprint detail.";
    roomLabelA.textContent = "Zone A";
    roomLabelB.textContent = "Zone B";
    roomLabelC.textContent = "Zone C";
    return;
  }

  blueprintTitle.textContent = `${sheet.sheetNumber} · ${sheet.sheetTitle}`;
  blueprintCaption.textContent =
    `Staged ${sheet.discipline} sheet from ${pkg?.name ?? "selected package"} with ${findings.length} active AI finding(s) and ${reviewRun ? "an associated review run" : "no review run yet"}.`;
  roomLabelA.textContent = `${sheet.discipline} core`;
  roomLabelB.textContent = permit ? "Permit edge" : "Coordination edge";
  roomLabelC.textContent = findings.length > 0 ? "Review concern zone" : "Package ready zone";

  const items = [
    `Package completeness: ${pkg?.completeness ?? "--"}%`,
    `Source format: ${sheet.sourceFormat?.toUpperCase() ?? "--"} · Revision ${sheet.revision ?? "A"}`,
    `Permit linkage: ${permit ? permit.status.replaceAll("_", " ") : "Not linked"}`,
    `Review state: ${reviewRun?.status?.replaceAll("_", " ") ?? "No staged review run"}`,
    `Findings: ${findings.length > 0 ? findings.map((item) => item.category.replaceAll("_", " ")).join(", ") : "No current findings for this sheet"}`
  ];

  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    blueprintCallouts.appendChild(li);
  }
}

function renderFindings() {
  findingList.innerHTML = "";
  const findings = currentFindings();

  for (const item of findings) {
    const element = findingTemplate.content.firstElementChild.cloneNode(true);
    element.querySelector(".finding-tag").textContent = item.category.replaceAll("_", " ");
    element.querySelector(".finding-title").textContent = item.title;
    element.querySelector(".finding-body").textContent = item.description;
    const tonePill = element.querySelector(".tone-pill");
    tonePill.className = `tone-pill ${item.humanDisposition}`;
    tonePill.textContent = item.humanDisposition.replaceAll("_", " ");
    element.querySelector(".finding-meta").textContent =
      `Confidence: ${item.confidence} · Severity: ${item.severity} · Evidence: ${(item.evidenceReferences ?? []).join(", ") || "None"}`;

    for (const button of element.querySelectorAll(".btn-action")) {
      button.classList.toggle("active", item.id === state.selectedFindingId && button.dataset.action === item.humanDisposition);
      button.addEventListener("click", async () => {
        state.selectedFindingId = item.id;
        await updateDisposition(item.id, button.dataset.action);
      });
    }

    element.addEventListener("click", () => {
      state.selectedFindingId = item.id;
      issueTitleInput.value = `Review ${currentSheet()?.sheetNumber ?? "sheet"}: ${item.title}`;
      issueDisciplineInput.value = item.assignedDiscipline ?? "architecture";
      issueSeverityInput.value = item.severity ?? "medium";
      updateConversionStatus();
      renderFindings();
    });

    findingList.appendChild(element);
  }
}

function renderSummary() {
  const workspace = state.workspace;
  const firstProject = workspace?.projects?.[0];
  const selectedPackage = currentPackage();
  const selectedReviewRun = workspace?.reviewRuns.find((run) => run.artifactId === state.selectedSheetId);

  projectName.textContent = firstProject?.name ?? "No project";
  packageStatus.textContent = selectedPackage?.status?.replaceAll("_", " ") ?? "No package";
  reviewSessionState.textContent = selectedReviewRun?.status?.replaceAll("_", " ") ?? "No review run";
  workflowState.textContent = currentFinding()?.humanDisposition?.replaceAll("_", " ") ?? "Awaiting finding selection";
}

function updateConversionStatus() {
  const finding = currentFinding();

  if (!finding) {
    conversionStatus.textContent = "Select a finding to enable conversion.";
    return;
  }

  if (finding.humanDisposition !== "accepted") {
    conversionStatus.textContent = "Accept the finding first, then convert it into a coordination issue.";
    return;
  }

  conversionStatus.textContent = "Ready to create coordination issue from accepted finding.";
}

function render() {
  renderPackages();
  renderSheets();
  renderMetadata();
  renderBlueprintDetail();
  renderFindings();
  renderSummary();
  updateConversionStatus();
}

async function loadWorkspace() {
  const apiBaseUrl = apiBaseUrlInput.value.replace(/\/+$/, "");
  setWorkspaceStatus("Loading staged blueprint workspace...");

  try {
    const payload = await getJson(`${apiBaseUrl}/v1/tenants/${tenantSelect.value}/blueprint-workspace`);
    state.workspace = payload.item;
    state.selectedPackageId = payload.item.packages[0]?.id ?? null;
    state.selectedSheetId = payload.item.sheets.find((sheet) => sheet.packageId === state.selectedPackageId)?.id ?? payload.item.sheets[0]?.id ?? null;
    state.selectedFindingId = null;
    setWorkspaceStatus("Workspace ready. Review the selected sheet and triage findings.");
    render();
  } catch (error) {
    setWorkspaceStatus(error.message, "error");
    packageList.innerHTML = "";
    sheetList.innerHTML = "";
    findingList.innerHTML = "";
    metadataGrid.innerHTML = "";
  }
}

async function updateDisposition(findingId, nextDisposition, relatedIssueId = null) {
  const apiBaseUrl = apiBaseUrlInput.value.replace(/\/+$/, "");
  const response = await fetch(`${apiBaseUrl}/v1/tenants/${tenantSelect.value}/ai-findings/${findingId}/disposition`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ nextDisposition, relatedIssueId })
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed with ${response.status}`);
  }

  await loadWorkspace();
  state.selectedFindingId = findingId;
  render();
}

async function createCoordinationIssue(event) {
  event.preventDefault();
  const finding = currentFinding();

  if (!finding || finding.humanDisposition !== "accepted") {
    conversionStatus.textContent = "Accepted finding required before conversion.";
    return;
  }

  const apiBaseUrl = apiBaseUrlInput.value.replace(/\/+$/, "");
  const sheet = currentSheet();
  const projectId = state.workspace?.projects?.[0]?.id;
  const issueId = `issue-${Date.now()}`;

  const createResponse = await fetch(`${apiBaseUrl}/v1/tenants/${tenantSelect.value}/issues`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      id: issueId,
      projectId,
      title: issueTitleInput.value,
      description: `Converted from AI finding ${finding.id} for ${sheet?.sheetNumber ?? "selected sheet"}.`,
      status: "open",
      disciplines: [issueDisciplineInput.value],
      severity: issueSeverityInput.value,
      priority: "medium"
    })
  });
  const createPayload = await createResponse.json().catch(() => ({}));

  if (!createResponse.ok) {
    conversionStatus.textContent = createPayload.message ?? `Issue creation failed with ${createResponse.status}`;
    return;
  }

  await updateDisposition(finding.id, "converted_to_issue", createPayload.item.id);
  conversionStatus.textContent = `Coordination issue ${createPayload.item.id} created and linked to the finding.`;
}

workspaceControls.addEventListener("submit", (event) => {
  event.preventDefault();
  loadWorkspace();
});

conversionForm.addEventListener("submit", createCoordinationIssue);

loadWorkspace();
