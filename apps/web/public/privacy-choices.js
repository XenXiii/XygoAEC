const form = document.querySelector("#privacy-form");
const status = document.querySelector("#privacy-status");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  status.textContent = "Submitting your request…";
  try {
    const data = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/privacy-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Unable to submit your request.");
    form.reset();
    status.textContent = `Request received. Reference: ${result.requestId}`;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

