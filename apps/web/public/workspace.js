import { accessToken, authenticatedFetch, logout } from "/auth-client.js";
import { setAuthState } from "/release-shell.js";
import { auditTiles, loadingAuditTiles, unavailableAuditTiles } from "/audit-results-view.js";

const status = document.querySelector("#workspace-auth-status");
const environment = document.querySelector("#runtime-environment");
const release = document.querySelector("#runtime-release");
const connection = document.querySelector("#connection-state");
const auditFields = {
  health: document.querySelector("#audit-health"), opportunities: document.querySelector("#audit-opportunities"),
  revenue: document.querySelector("#audit-revenue"), issues: document.querySelector("#audit-issues"),
  automation: document.querySelector("#audit-automation"), note: document.querySelector("#audit-result-note")
};

function renderAuditTiles(tiles) {
  for (const key of ["health", "opportunities", "revenue", "issues", "automation", "note"]) auditFields[key].textContent = tiles[key];
}

async function loadAuditResult(config) {
  renderAuditTiles(loadingAuditTiles());
  try {
    const response = await authenticatedFetch(`${config.apiBaseUrl.replace(/\/$/, "")}/v1/session/audit-result`, {
      cache: "no-store",
      headers: config.auth.mode === "staged" ? { "x-staged-tenant-id": "tenant-commercial-sim" } : {}
    });
    if (!response.ok) throw new Error(`Audit result request failed (${response.status}).`);
    const payload = await response.json();
    renderAuditTiles(auditTiles(payload.item));
  } catch {
    renderAuditTiles(unavailableAuditTiles());
  }
}

async function start() {
  setAuthState("loading");
  try {
    const configResponse = await fetch("/runtime-config.json", { cache: "no-store", credentials: "same-origin" });
    if (!configResponse.ok) throw new Error("Runtime configuration unavailable.");
    const config = await configResponse.json();
    environment.textContent = config.environment;
    release.textContent = config.release;
    const token = await accessToken();
    if (config.auth.mode === "oidc" && !token) return;
    status.innerHTML = `<span class="tone-pill success">${config.auth.mode === "oidc" ? "Signed in" : "Local staged mode"}</span>`;
    setAuthState("ready");
    await loadAuditResult(config);
  } catch (error) {
    setAuthState("error", { detail: error.message });
  }
}

function updateConnection() {
  connection.textContent = navigator.onLine ? "Online" : "Offline — shell only";
}

document.querySelector("#logout").addEventListener("click", () => logout());
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);
updateConnection();
start();
