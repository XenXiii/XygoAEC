import { authenticatedFetch } from "/auth-client.js";

// Field Reporting operator + client panel. Reads/writes the staged API and renders
// with textContent/DOM (no innerHTML). Write actions send the staged tenant header.
const controls = document.querySelector("#controls");
const tenantSelect = document.querySelector("#tenant");
const apiBaseInput = document.querySelector("#api-base");
const statusEl = document.querySelector("#status");
const operatorEl = document.querySelector("#operator");
const clientEl = document.querySelector("#client");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "state error" : "state";
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function apiBase() {
  return apiBaseInput.value.replace(/\/+$/, "");
}

async function api(method, path, tenantId, bodyObj) {
  const response = await authenticatedFetch(`${apiBase()}${path}`, {
    method,
    headers: { "x-staged-tenant-id": tenantId, ...(bodyObj ? { "content-type": "application/json" } : {}) },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return response.json();
}

function renderDraft(container, draft) {
  const wrap = el("div", undefined, "draft");
  wrap.append(el("strong", draft.title));
  for (const section of draft.sections ?? []) {
    wrap.append(el("h3", section.heading));
    if (section.body) {
      wrap.append(el("p", section.body, "muted"));
    }
    for (const item of section.items ?? []) {
      wrap.append(el("div", `• ${item}`, "obs"));
    }
  }
  container.append(wrap);
}

function renderReport(report, tenantId) {
  const card = el("div", undefined, "card");
  const row = el("div", undefined, "row");
  const left = el("div");
  left.append(el("h3", `${report.reportType} — ${report.siteName}`));
  left.append(el("div", `Author: ${report.author} · ${report.observations.length} observation(s)`, "muted"));
  const right = el("div", undefined, "actions");
  right.append(el("span", report.status, `status ${report.status}`));

  // Contextual actions by state.
  if (report.status === "captured") {
    const draftBtn = el("button", "Generate draft", "btn-primary");
    draftBtn.addEventListener("click", () => act(`/v1/tenants/${tenantId}/field-reports/${report.id}/draft`, tenantId));
    right.append(draftBtn);
  } else if (report.status === "draft_generated" || report.status === "in_review" || report.status === "changes_requested") {
    const approveBtn = el("button", "Approve", "btn-approve");
    approveBtn.addEventListener("click", () =>
      act(`/v1/tenants/${tenantId}/field-reports/${report.id}/review`, tenantId, { nextStatus: "approved" })
    );
    right.append(approveBtn);
  }

  row.append(left, right);
  card.append(row);
  if (report.draft) {
    renderDraft(card, report.draft);
  }
  return card;
}

async function act(path, tenantId, bodyObj) {
  try {
    setStatus("Working…");
    await api("POST", path, tenantId, bodyObj);
    await load();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function load() {
  const tenantId = tenantSelect.value;
  operatorEl.replaceChildren();
  clientEl.replaceChildren();
  setStatus("Loading staged field reports…");

  try {
    const list = await api("GET", `/v1/tenants/${tenantId}/field-reports`, tenantId);
    const reports = list.items ?? [];
    setStatus(`Loaded ${reports.length} report(s) for ${tenantId}.`);

    operatorEl.append(el("h2", "Operator — all reports"));
    if (reports.length === 0) {
      operatorEl.append(el("p", "No field reports captured yet.", "muted"));
    }
    for (const report of reports) {
      operatorEl.append(renderReport(report, tenantId));
    }

    // Client portal gate: only approved reports.
    const approved = reports.filter((r) => r.clientVisible && r.status === "approved");
    clientEl.append(el("h2", `Client Portal — approved reports (${approved.length})`));
    if (approved.length === 0) {
      clientEl.append(el("p", "No approved reports are visible to the client yet.", "muted"));
    }
    for (const report of approved) {
      const card = el("div", undefined, "card");
      card.append(el("h3", report.draft?.title ?? report.siteName));
      renderDraft(card, report.draft ?? { title: report.siteName, sections: [] });
      clientEl.append(card);
    }
  } catch (error) {
    const unreachable = /Failed to fetch|NetworkError|Load failed/i.test(error.message);
    setStatus(unreachable ? `API not reachable at ${apiBase()}. Start it with: npm run start:api` : error.message, true);
  }
}

controls.addEventListener("submit", (event) => {
  event.preventDefault();
  load();
});

load();
