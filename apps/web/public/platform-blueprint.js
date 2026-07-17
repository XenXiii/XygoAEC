// Live panel for the generated Business Platform Blueprint. Reads from the staged
// API and renders with textContent/DOM (no innerHTML) so record content can never
// inject markup.
const controls = document.querySelector("#controls");
const tenantSelect = document.querySelector("#tenant");
const apiBaseInput = document.querySelector("#api-base");
const statusEl = document.querySelector("#status");
const summaryEl = document.querySelector("#summary");
const modulesEl = document.querySelector("#modules");
const stepsEl = document.querySelector("#steps");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? "state error" : "state";
}

function clear(...nodes) {
  for (const node of nodes) {
    node.replaceChildren();
  }
}

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  return node;
}

async function getJson(url, tenantId) {
  const response = await fetch(url, { headers: { "x-staged-tenant-id": tenantId } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return response.json();
}

function renderBlueprint(bp) {
  // Summary
  const summaryCard = el("div", undefined, "card");
  summaryCard.append(el("h2", `${bp.businessName} — ${bp.industry}`));
  summaryCard.append(el("p", bp.summary, "muted"));
  summaryEl.append(summaryCard);

  // Recommended modules
  modulesEl.append(el("h2", `Recommended modules (${bp.recommendedModules.length})`));
  const grid = el("div", undefined, "grid");
  for (const module of bp.recommendedModules) {
    const card = el("div", undefined, "card");
    const title = el("strong", module.name);
    title.append(el("span", module.category, "pill"));
    card.append(title);
    card.append(el("div", `Replaces: ${module.replaces}`, "replaces"));
    card.append(el("div", `Why: ${module.rationale}`, "rationale"));
    grid.append(card);
  }
  modulesEl.append(grid);

  // Next build steps
  stepsEl.append(el("h2", `Next build steps (${bp.nextBuildSteps.length})`));
  const list = el("ol");
  for (const step of bp.nextBuildSteps) {
    const li = el("li");
    li.append(el("span", step.action));
    li.append(el("span", ` — replaces ${step.replaces}`, "replaces"));
    list.append(li);
  }
  stepsEl.append(list);
}

async function load() {
  const tenantId = tenantSelect.value;
  const apiBase = apiBaseInput.value.replace(/\/+$/, "");
  clear(summaryEl, modulesEl, stepsEl);
  setStatus("Loading staged blueprint…");

  try {
    const list = await getJson(`${apiBase}/v1/tenants/${tenantId}/platform-blueprints`, tenantId);
    const blueprints = list.items ?? [];
    if (blueprints.length === 0) {
      setStatus(`No staged blueprint for ${tenantId} yet. Create one via POST /v1/tenants/${tenantId}/platform-blueprints.`);
      return;
    }
    setStatus(`Loaded ${blueprints.length} staged blueprint(s) for ${tenantId}.`);
    for (const bp of blueprints) {
      renderBlueprint(bp);
    }
  } catch (error) {
    const unreachable = /Failed to fetch|NetworkError|Load failed/i.test(error.message);
    setStatus(
      unreachable
        ? `API not reachable at ${apiBase}. Start it with: npm run start:api`
        : error.message,
      true
    );
  }
}

controls.addEventListener("submit", (event) => {
  event.preventDefault();
  load();
});

load();
