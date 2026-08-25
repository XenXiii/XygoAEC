const header = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
const reveals = document.querySelectorAll(".reveal");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const demoScenarios = {
  construction: {
    title: "Construction overview", inputs: ["QuickBooks", "Job schedule", "CRM"], insight: "Recover stalled estimates", detail: "14 estimates have had no follow-up in seven days.", value: "$42k", confidence: "91%", action: "Automated estimate follow-up"
  },
  field: {
    title: "Field services overview", inputs: ["Dispatch", "Invoices", "Customer inbox"], insight: "Reduce empty drive time", detail: "Route overlap is costing an estimated 11 technician hours each week.", value: "$28k", confidence: "88%", action: "Route-aware dispatch board"
  },
  inspections: {
    title: "Inspections overview", inputs: ["Checklists", "Photo archive", "Reports"], insight: "Ship reports sooner", detail: "Five completed inspections are waiting on manual report assembly.", value: "18 hrs", confidence: "94%", action: "Evidence-to-report workflow"
  },
  engineering: {
    title: "Engineering overview", inputs: ["Project files", "Review log", "Milestones"], insight: "Unblock design review", detail: "Three critical reviews have no clear owner or response deadline.", value: "9 days", confidence: "86%", action: "Governed review queue"
  }
};

function simplifyPublicChrome() {
  if (navLinks) {
    navLinks.innerHTML = [
      ["/#product", "Product"],
      ["/business-audit", "Audit"],
      ["/services", "Plans"],
      ["/demo", "Demo"]
    ].map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("");
  }
  const actions = document.querySelector(".nav-actions");
  if (actions) actions.innerHTML = '<a class="text-link" href="/contact">Contact</a><a class="btn btn-primary" href="/demo">Start audit</a>';
}

function syncHeader() {
  header?.classList.toggle("scrolled", window.scrollY > 8);
}

function closeMenu() {
  menuToggle?.setAttribute("aria-expanded", "false");
  navLinks?.classList.remove("open");
  header?.classList.remove("menu-open");
  document.body.classList.remove("menu-open");
}

function toggleMenu() {
  const expanded = menuToggle?.getAttribute("aria-expanded") === "true";
  menuToggle?.setAttribute("aria-expanded", String(!expanded));
  navLinks?.classList.toggle("open", !expanded);
  header?.classList.toggle("menu-open", !expanded);
  document.body.classList.toggle("menu-open", !expanded);
}

function markActivePage() {
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";

  for (const link of document.querySelectorAll(".nav-links a")) {
    const href = link.getAttribute("href")?.replace(/\/$/, "") || "/";
    link.classList.toggle("active", href === currentPath);
  }
}

function revealContent() {
  if (reduceMotion || !("IntersectionObserver" in window)) {
    for (const element of reveals) {
      element.classList.add("in");
    }

    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.16 });

  for (const element of reveals) {
    observer.observe(element);
  }
}

function renderDemoScenario(key = "construction") {
  const scenario = demoScenarios[key] ?? demoScenarios.construction;
  const title = document.querySelector("[data-demo-title]");
  const inputList = document.querySelector("[data-demo-inputs]");
  const insight = document.querySelector("[data-demo-insight]");
  const detail = document.querySelector("[data-demo-detail]");
  const value = document.querySelector("[data-demo-value]");
  const confidence = document.querySelector("[data-demo-confidence]");
  const action = document.querySelector("[data-demo-action]");

  if (!title || !inputList || !insight) {
    return;
  }

  title.textContent = scenario.title;
  inputList.innerHTML = scenario.inputs.map((item) => `<li>${item}</li>`).join("");
  insight.textContent = scenario.insight;
  detail.textContent = scenario.detail;
  value.textContent = scenario.value;
  confidence.textContent = scenario.confidence;
  action.textContent = scenario.action;
}

function setupDemoControls() {
  const scenarioButtons = document.querySelectorAll("[data-scenario]");
  const tabButtons = document.querySelectorAll("[data-tab]");
  const tabPanels = document.querySelectorAll("[data-tab-panel]");
  const filterButtons = document.querySelectorAll("[data-filter]");
  const moduleItems = document.querySelectorAll("[data-module-type]");

  for (const button of scenarioButtons) {
    button.addEventListener("click", () => {
      for (const option of scenarioButtons) {
        option.setAttribute("aria-pressed", String(option === button));
      }

      renderDemoScenario(button.dataset.scenario);
    });
  }

  for (const button of tabButtons) {
    button.addEventListener("click", () => {
      for (const option of tabButtons) {
        option.setAttribute("aria-selected", String(option === button));
      }

      for (const panel of tabPanels) {
        panel.hidden = panel.dataset.tabPanel !== button.dataset.tab;
      }
    });
  }

  for (const button of filterButtons) {
    button.addEventListener("click", () => {
      const filter = button.dataset.filter ?? "all";

      for (const option of filterButtons) {
        option.setAttribute("aria-pressed", String(option === button));
      }

      for (const item of moduleItems) {
        item.hidden = filter !== "all" && item.dataset.moduleType !== filter;
      }
    });
  }
}

function setupForms() {
  for (const form of document.querySelectorAll("[data-email-form]")) {
    let submitted = false;
    const status = form.querySelector("[data-form-status]");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (submitted) {
        status.textContent = "This request was already prepared. Refresh the page before sending another.";
        status.className = "form-status error";
        return;
      }

      if (form.elements.website?.value) {
        status.textContent = "Submission blocked.";
        status.className = "form-status error";
        return;
      }

      let valid = true;
      const requiredFields = form.querySelectorAll("[required]");

      for (const field of requiredFields) {
        const error = form.querySelector(`[data-error-for="${field.id}"]`);

        if (!field.value.trim()) {
          valid = false;
          field.setAttribute("aria-invalid", "true");
          if (error) {
            error.textContent = "Required.";
          }
        } else {
          field.removeAttribute("aria-invalid");
          if (error) {
            error.textContent = "";
          }
        }
      }

      if (!valid) {
        status.textContent = "Please complete the required fields before preparing the email.";
        status.className = "form-status error";
        return;
      }

      submitted = true;
      status.textContent = "Sending your request…";
      status.className = "form-status";

      const data = new FormData(form);
      const fields = Object.fromEntries(Array.from(data.entries())
        .filter(([key, value]) => key !== "website" && String(value).trim()));

      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            subject: form.dataset.subject ?? "Xygo inquiry",
            website: form.elements.website?.value ?? "",
            fields
          })
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.error || "Unable to send request.");
        }

        status.textContent = "Your request was sent. Xygo will follow up shortly.";
        status.className = "form-status success";
        form.reset();
      } catch {
        submitted = false;
        status.textContent = "We could not send your request. Please email xagent@xygo.pro directly.";
        status.className = "form-status error";
      }
    });
  }
}

function setupBusinessConstellation() {
  const canvas = document.querySelector("#business-constellation");
  if (!canvas) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  const points = [
    { x: .21, y: .29, color: "110,231,224" },
    { x: .77, y: .27, color: "116,167,255" },
    { x: .16, y: .68, color: "161,140,255" },
    { x: .82, y: .65, color: "110,231,224" },
    { x: .50, y: .84, color: "116,167,255" },
    { x: .38, y: .18, color: "255,139,149" },
    { x: .66, y: .47, color: "161,140,255" }
  ];
  const pointer = { x: .5, y: .5, active: false };
  let width = 0;
  let height = 0;
  let frame = 0;
  let visible = true;
  let inViewport = true;

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function draw(time = 0) {
    context.clearRect(0, 0, width, height);
    const center = { x: width * .5, y: height * .5 };
    const focus = pointer.active ? { x: pointer.x * width, y: pointer.y * height } : center;

    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const drift = reduceMotion ? 0 : Math.sin(time * .0007 + index * 1.7) * 8;
      const x = point.x * width + drift;
      const y = point.y * height + Math.cos(time * .0006 + index) * (reduceMotion ? 0 : 6);
      const influence = Math.max(0, 1 - Math.hypot(x - focus.x, y - focus.y) / (width * .34));
      const targetX = center.x + (focus.x - center.x) * influence * .08;
      const targetY = center.y + (focus.y - center.y) * influence * .08;

      const gradient = context.createLinearGradient(x, y, targetX, targetY);
      gradient.addColorStop(0, `rgba(${point.color},${.16 + influence * .28})`);
      gradient.addColorStop(1, "rgba(110,231,224,.34)");
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo((x + targetX) / 2 + drift * 1.7, (y + targetY) / 2 - drift, targetX, targetY);
      context.strokeStyle = gradient;
      context.lineWidth = .7 + influence * 1.2;
      context.stroke();

      const glow = context.createRadialGradient(x, y, 0, x, y, 22 + influence * 18);
      glow.addColorStop(0, `rgba(${point.color},.9)`);
      glow.addColorStop(.18, `rgba(${point.color},.34)`);
      glow.addColorStop(1, `rgba(${point.color},0)`);
      context.fillStyle = glow;
      context.fillRect(x - 42, y - 42, 84, 84);
      context.beginPath();
      context.arc(x, y, 3.5 + influence * 2.5, 0, Math.PI * 2);
      context.fillStyle = `rgba(${point.color},1)`;
      context.fill();
    }

    if (!reduceMotion && visible && inViewport) frame = requestAnimationFrame(draw);
  }

  function updatePointer(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    pointer.y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    pointer.active = true;
  }

  canvas.addEventListener("pointermove", updatePointer, { passive: true });
  canvas.addEventListener("pointerleave", () => { pointer.active = false; });
  window.addEventListener("resize", () => { resize(); if (reduceMotion) draw(); }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible && inViewport && !reduceMotion) {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    }
  });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      if (inViewport && visible && !reduceMotion) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
      }
    }, { rootMargin: "120px" });
    observer.observe(canvas);
  }

  resize();
  draw();
}

syncHeader();
simplifyPublicChrome();
markActivePage();
revealContent();
renderDemoScenario();
setupDemoControls();
setupForms();
setupBusinessConstellation();

window.addEventListener("scroll", syncHeader, { passive: true });
menuToggle?.addEventListener("click", toggleMenu);
navLinks?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    closeMenu();
  }
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenu();
  }
});
