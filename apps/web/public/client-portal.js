// Read-only client portal view. Fetches the composed portal from the staged API
// and renders with textContent/DOM (no innerHTML).
const controls = document.querySelector("#controls");
const tenantSelect = document.querySelector("#tenant");
const apiBaseInput = document.querySelector("#api-base");
const statusEl = document.querySelector("#status");
const portalsEl = document.querySelector("#portals");

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

async function getJson(path, tenantId) {
  const response = await fetch(`${apiBase()}${path}`, { headers: { "x-staged-tenant-id": tenantId } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return response.json();
}

function renderPortal(portal) {
  const card = el("div", undefined, "project");
  const head = el("h2", portal.projectName);
  head.append(el("span", portal.projectStatus, "status"));
  card.append(head);

  // Approved reports
  card.append(el("h3", `Approved reports (${portal.reports.length})`));
  if (portal.reports.length === 0) {
    card.append(el("p", "No approved reports yet.", "muted"));
  }
  for (const report of portal.reports) {
    const wrap = el("div", undefined, "report");
    wrap.append(el("strong", report.title));
    for (const section of report.sections ?? []) {
      wrap.append(el("h4", section.heading));
      if (section.body) wrap.append(el("p", section.body, "muted"));
      if ((section.items ?? []).length) {
        const ul = el("ul");
        for (const item of section.items) ul.append(el("li", item));
        wrap.append(ul);
      }
    }
    card.append(wrap);
  }

  // Files
  card.append(el("h3", `Files (${portal.files.length})`));
  if (portal.files.length === 0) {
    card.append(el("p", "No shared files.", "muted"));
  } else {
    const ul = el("ul");
    for (const file of portal.files) ul.append(el("li", `${file.name} (${file.fileClass})`));
    card.append(ul);
  }

  // Updates
  card.append(el("h3", `Updates (${portal.updates.length})`));
  if (portal.updates.length === 0) {
    card.append(el("p", "No updates.", "muted"));
  } else {
    const ul = el("ul");
    for (const update of portal.updates) ul.append(el("li", `${(update.at ?? "").slice(0, 10)} — ${update.message}`));
    card.append(ul);
  }

  // Payment placeholder
  card.append(el("div", `Billing: ${portal.payment.note}`, "pay"));

  return card;
}

async function load() {
  const tenantId = tenantSelect.value;
  portalsEl.replaceChildren();
  setStatus("Loading staged client portal…");

  try {
    const result = await getJson(`/v1/tenants/${tenantId}/client-portal`, tenantId);
    const portals = result.items ?? [];
    setStatus(`Loaded ${portals.length} project portal(s) for ${tenantId}.`);
    if (portals.length === 0) {
      portalsEl.append(el("p", "No projects for this client.", "muted"));
    }
    for (const portal of portals) {
      portalsEl.append(renderPortal(portal));
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
