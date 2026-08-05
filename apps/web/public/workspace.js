import { accessToken, logout } from "/auth-client.js";
import { setAuthState } from "/release-shell.js";

const status = document.querySelector("#workspace-auth-status");
const environment = document.querySelector("#runtime-environment");
const release = document.querySelector("#runtime-release");
const connection = document.querySelector("#connection-state");

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
