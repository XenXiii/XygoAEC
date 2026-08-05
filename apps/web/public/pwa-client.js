let installPrompt;

function announce(message, action) {
  let bar = document.querySelector("#release-update-bar");
  if (!bar) {
    bar = document.createElement("aside");
    bar.id = "release-update-bar";
    bar.className = "release-update-bar";
    bar.setAttribute("aria-live", "polite");
    document.body.appendChild(bar);
  }
  bar.replaceChildren(document.createTextNode(message));
  if (action) bar.appendChild(action);
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  const existingButton = document.querySelector("#install-app");
  const button = existingButton ?? document.createElement("button");
  button.type = "button";
  button.hidden = false;
  button.textContent = "Install app";
  button.addEventListener("click", async () => {
    await installPrompt?.prompt();
    installPrompt = null;
    button.hidden = true;
    document.querySelector("#release-update-bar")?.remove();
  });
  if (!existingButton) announce("Install Xygo for quicker workspace access. ", button);
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  document.querySelector("#install-app")?.setAttribute("hidden", "");
  document.querySelector("#release-update-bar")?.remove();
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", async () => {
    const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/", updateViaCache: "none" });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Update now";
          button.addEventListener("click", () => registration.waiting?.postMessage({ type: "SKIP_WAITING" }));
          announce("A new Xygo release is ready. ", button);
        }
      });
    });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload());
}
