import { createBoardSections, createSummaryCards, formatStatusTone } from "/src/view-models.js";

const controls = document.querySelector("#controls");
const tenantSelect = document.querySelector("#tenant-select");
const apiBaseUrlInput = document.querySelector("#api-base-url");
const summaryGrid = document.querySelector("#summary-grid");
const boardGrid = document.querySelector("#board-grid");
const statusRow = document.querySelector("#status-row");
const liveIndicator = document.querySelector("#live-indicator");
const cardTemplate = document.querySelector("#card-template");
const boardTemplate = document.querySelector("#board-template");

let activeStream = null;

async function getJson(url, tenantId) {
  const response = await fetch(url, {
    headers: {
      "x-staged-tenant-id": tenantId
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed with ${response.status}`);
  }

  return response.json();
}

function renderSummary(summary) {
  summaryGrid.innerHTML = "";
  const cards = createSummaryCards(summary);

  for (const card of cards) {
    const element = cardTemplate.content.firstElementChild.cloneNode(true);
    element.querySelector(".metric-label").textContent = card.label;
    element.querySelector(".metric-value").textContent = String(card.value);
    summaryGrid.appendChild(element);
  }
}

function renderBoards(data) {
  boardGrid.innerHTML = "";
  const sections = createBoardSections(data);

  for (const section of sections) {
    const board = boardTemplate.content.firstElementChild.cloneNode(true);
    board.querySelector("h3").textContent = section.title;
    board.querySelector(".count-pill").textContent = String(section.items.length);

    const body = board.querySelector(".board-body");
    if (section.items.length === 0) {
      const state = document.createElement("div");
      state.className = "state-box";
      state.textContent = section.empty;
      body.appendChild(state);
    } else {
      for (const item of section.items) {
        const card = document.createElement("article");
        card.className = "board-item";
        const title = item.name ?? item.title ?? item.id;
        const status = item.status ?? item.humanDisposition ?? "staged";
        const detail = item.description ?? item.question ?? item.jurisdictionProfile ?? item.projectType ?? "Synthetic staged record";

        const header = document.createElement("header");
        const titleEl = document.createElement("strong");
        titleEl.textContent = title;
        const statusEl = document.createElement("span");
        statusEl.className = `tone-pill ${formatStatusTone(status)}`;
        statusEl.textContent = status;
        header.append(titleEl, statusEl);

        const detailEl = document.createElement("p");
        detailEl.textContent = detail;

        card.append(header, detailEl);
        body.appendChild(card);
      }
    }

    boardGrid.appendChild(board);
  }
}

function setStatus(message, tone = "neutral") {
  statusRow.innerHTML = "";
  const state = document.createElement("div");
  state.className = `state-box ${tone === "error" ? "error" : ""}`;
  state.textContent = message;
  statusRow.appendChild(state);
}

function connectStream(apiBaseUrl, tenantId) {
  if (activeStream) {
    activeStream.close();
  }

  const streamUrl = `${apiBaseUrl}/v1/tenants/${tenantId}/events/stream?stagedTenantId=${encodeURIComponent(tenantId)}`;
  const eventSource = new EventSource(streamUrl, {
    withCredentials: false
  });

  liveIndicator.textContent = "Live updates connecting";

  eventSource.addEventListener("snapshot", (event) => {
    const payload = JSON.parse(event.data);
    liveIndicator.textContent = `Live updates active for ${payload.tenantId}`;
  });

  eventSource.addEventListener("heartbeat", () => {
    liveIndicator.textContent = `Live updates active for ${tenantId}`;
  });

  eventSource.onerror = () => {
    liveIndicator.textContent = "Live updates unavailable";
  };

  activeStream = eventSource;
}

async function refresh() {
  const tenantId = tenantSelect.value;
  const apiBaseUrl = apiBaseUrlInput.value.replace(/\/+$/, "");

  setStatus("Loading staged workspace data...");

  try {
    const [summary, projects, issues, rfis, permits, reviewSessions, aiFindings] = await Promise.all([
      getJson(`${apiBaseUrl}/v1/tenants/${tenantId}/dashboard/executive`, tenantId),
      getJson(`${apiBaseUrl}/v1/tenants/${tenantId}/projects`, tenantId),
      getJson(`${apiBaseUrl}/v1/tenants/${tenantId}/issues`, tenantId),
      getJson(`${apiBaseUrl}/v1/tenants/${tenantId}/rfis`, tenantId),
      getJson(`${apiBaseUrl}/v1/tenants/${tenantId}/permits`, tenantId),
      getJson(`${apiBaseUrl}/v1/tenants/${tenantId}/review-sessions`, tenantId),
      getJson(`${apiBaseUrl}/v1/tenants/${tenantId}/ai-findings`, tenantId)
    ]);

    renderSummary(summary.item);
    renderBoards({
      projects: projects.items,
      issues: issues.items,
      rfis: rfis.items,
      permits: permits.items,
      reviewSessions: reviewSessions.items,
      aiFindings: aiFindings.items
    });
    setStatus(`Loaded staged tenant ${tenantId}.`);
    connectStream(apiBaseUrl, tenantId);
  } catch (error) {
    setStatus(error.message, "error");
    liveIndicator.textContent = "Live updates disconnected";
    summaryGrid.innerHTML = "";
    boardGrid.innerHTML = "";
  }
}

controls.addEventListener("submit", (event) => {
  event.preventDefault();
  refresh();
});

refresh();
