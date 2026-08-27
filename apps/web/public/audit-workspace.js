const messages = document.querySelector("#messages");
const form = document.querySelector("#composer");
const input = document.querySelector("#message");
const sync = document.querySelector("#sync-status");
document.querySelector(".citation").addEventListener("click", () => {
  const target = document.querySelector("#sales-cycle"); target.classList.add("highlight"); target.focus();
  setTimeout(() => target.classList.remove("highlight"), 1200);
});
document.querySelector("#save-fact").addEventListener("click", () => {
  const value = document.querySelector("#proposal-count").value.trim(); if (!value) return;
  document.querySelector("#follow-up-metric").textContent = `${value} open`;
  sync.textContent = "● Canvas updated"; setTimeout(() => { sync.textContent = "● Synced"; }, 1600);
});
form.addEventListener("submit", (event) => {
  event.preventDefault(); const value = input.value.trim(); if (!value) return;
  const article = document.createElement("article"); article.className = "message user";
  const p = document.createElement("p"); p.textContent = value; article.append(p); messages.append(article);
  input.value = ""; article.scrollIntoView({ block: "end" });
});
