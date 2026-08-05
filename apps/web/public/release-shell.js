const stateCopy = {
  loading: ["Checking your session", "Connecting securely to the Xygo workspace."],
  signed_out: ["Sign in required", "Your workspace is protected. Sign in to continue."],
  expired: ["Session expired", "Your session ended safely. Sign in again to continue."],
  unauthorized: ["Access denied", "Your account cannot access this tenant or workspace."],
  error: ["Workspace unavailable", "The release surface could not be loaded. Retry or contact support."],
  ready: ["Workspace ready", "Authenticated session active."]
};

function shell() {
  let node = document.querySelector("#auth-state-shell");
  if (node) return node;
  node = document.createElement("section");
  node.id = "auth-state-shell";
  node.className = "auth-state-shell";
  node.setAttribute("aria-live", "polite");
  node.hidden = true;
  node.innerHTML = `<div class="auth-state-card"><span class="auth-state-mark" aria-hidden="true">X</span><p class="eyebrow">Secure workspace</p><h1></h1><p data-auth-detail></p><div class="auth-state-actions"></div></div>`;
  document.body.prepend(node);
  return node;
}

export function setAuthState(state, { detail, loginEndpoint = "/auth/login" } = {}) {
  const node = shell();
  const [title, fallback] = stateCopy[state] ?? stateCopy.error;
  node.dataset.state = state;
  node.querySelector("h1").textContent = title;
  node.querySelector("[data-auth-detail]").textContent = detail ?? fallback;
  const actions = node.querySelector(".auth-state-actions");
  actions.replaceChildren();
  if (["signed_out", "expired"].includes(state)) {
    const link = document.createElement("a");
    link.className = "auth-state-primary";
    link.href = `${loginEndpoint}?returnTo=${encodeURIComponent(location.pathname)}`;
    link.textContent = state === "expired" ? "Sign in again" : "Sign in";
    actions.appendChild(link);
  }
  if (["unauthorized", "error"].includes(state)) {
    const home = document.createElement("a");
    home.href = "/workspace";
    home.textContent = "Return to workspace";
    actions.appendChild(home);
  }
  node.hidden = state === "ready";
  document.documentElement.dataset.authState = state;
}
