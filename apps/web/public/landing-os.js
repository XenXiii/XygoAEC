const composer = document.querySelector("#scale-composer");
const prompt = document.querySelector("#scale-prompt");

for (const button of document.querySelectorAll("[data-prompt]")) {
  button.addEventListener("click", () => {
    if (!(prompt instanceof HTMLTextAreaElement)) return;
    prompt.value = button.dataset.prompt ?? "";
    prompt.focus();
  });
}

composer?.addEventListener("submit", (event) => {
  if (!(prompt instanceof HTMLTextAreaElement) || !prompt.value.trim()) return;
  event.preventDefault();
  // Stash the objective so it survives the sign-in redirect and can be persisted
  // server-side once authenticated — it must never live in browser-only state.
  try { sessionStorage.setItem("xygo.objective", prompt.value.trim()); } catch {}
  const params = new URLSearchParams({ fixture: "profile", prompt: prompt.value.trim() });
  window.location.assign(`/app?${params.toString()}`);
});

document.querySelector(".announcement button")?.addEventListener("click", (event) => {
  event.currentTarget.closest(".announcement")?.remove();
  document.body.classList.add("announcement-dismissed");
});
