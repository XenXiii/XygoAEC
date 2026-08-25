const PLAN_NAMES = { basic: "Basic", premium: "Premium", business: "Business" };
const params = new URLSearchParams(window.location.search);
const plan = String(params.get("plan") ?? "").toLowerCase();
const title = document.querySelector("[data-checkout-title]");
const copy = document.querySelector("[data-checkout-copy]");
const status = document.querySelector("[data-checkout-status]");
const retry = document.querySelector("[data-checkout-retry]");
const contact = document.querySelector("[data-checkout-contact]");
const loader = document.querySelector(".checkout-loader");

async function beginCheckout() {
  if (!PLAN_NAMES[plan]) {
    title.textContent = "Choose a valid plan.";
    copy.textContent = "Basic, Premium, and Business are available through secure checkout.";
    loader.hidden = true;
    contact.hidden = false;
    return;
  }
  title.textContent = `${PLAN_NAMES[plan]} checkout`;
  copy.textContent = "Connecting you to Stripe’s secure payment page…";
  status.textContent = "";
  retry.hidden = true;
  contact.hidden = true;
  loader.hidden = false;
  try {
    const response = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const result = await response.json();
    if (!response.ok || !result.url) throw new Error(result.error || "Checkout unavailable.");
    window.location.assign(result.url);
  } catch (error) {
    loader.hidden = true;
    status.textContent = error.message === "Checkout is not configured." ? "Secure payment setup is being completed. Contact Xygo to start this plan today." : "Secure checkout could not be opened. Please try again.";
    status.className = "form-status error";
    retry.hidden = false;
    contact.hidden = false;
  }
}

retry?.addEventListener("click", beginCheckout);
beginCheckout();
