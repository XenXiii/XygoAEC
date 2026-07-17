const header = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
const reveals = document.querySelectorAll(".reveal");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const demoScenarios = {
  construction: {
    title: "Construction operating system",
    inputs: ["Leads", "Estimates", "Subcontractors", "Permits", "Field reports", "Job costs"],
    blueprint: ["Role map: owner, PM, foreman, client", "Automation: estimate follow-up and permit reminders", "Risk: missing COIs and delayed approvals"],
    modules: ["CRM and lead intake", "Scheduling and dispatch", "Client portal", "Permit tracker", "Job-costing dashboard", "AI project coordinator"],
    metrics: ["18", "Open jobs", "7", "Permit checks", "4", "AI follow-ups"]
  },
  field: {
    title: "Field services operating system",
    inputs: ["Service calls", "Technicians", "Routes", "Parts", "Invoices", "Customer updates"],
    blueprint: ["Role map: dispatcher, technician, manager", "Automation: reminders and post-job follow-up", "Risk: missed appointments and incomplete job records"],
    modules: ["Intake queue", "Dispatch calendar", "Technician notes", "Customer updates", "Invoice status", "AI receptionist"],
    metrics: ["26", "Scheduled jobs", "9", "Route notes", "12", "Customer updates"]
  },
  inspections: {
    title: "Inspections operating system",
    inputs: ["Requests", "Checklists", "Evidence", "Photos", "Reports", "Approvals"],
    blueprint: ["Role map: coordinator, inspector, reviewer", "Automation: checklist completion and report drafting", "Risk: missing evidence and late delivery"],
    modules: ["Inspection intake", "Assignment board", "Evidence vault", "Report builder", "Approval workflow", "AI report assistant"],
    metrics: ["14", "Active inspections", "32", "Evidence items", "5", "Reports ready"]
  },
  engineering: {
    title: "Engineering services operating system",
    inputs: ["Projects", "Documents", "Reviews", "Milestones", "Client reports", "Technical tasks"],
    blueprint: ["Role map: principal, engineer, reviewer, client", "Automation: review routing and milestone alerts", "Risk: document drift and unclear ownership"],
    modules: ["Project dashboard", "Document review", "Milestone tracker", "Client reporting", "Task workflows", "AI knowledge assistant"],
    metrics: ["11", "Project reviews", "6", "Milestones", "21", "Document checks"]
  },
  home: {
    title: "Home services operating system",
    inputs: ["Marketing leads", "Estimates", "Appointments", "Field teams", "Payments", "Follow-ups"],
    blueprint: ["Role map: sales, office, technician, customer", "Automation: lead nurture and payment reminders", "Risk: lost leads and slow follow-up"],
    modules: ["Lead capture", "Appointment booking", "Field notes", "Customer portal", "Payment tracker", "AI follow-up agent"],
    metrics: ["38", "New leads", "16", "Booked visits", "19", "Follow-ups"]
  }
};

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
  const blueprintList = document.querySelector("[data-demo-blueprint]");
  const moduleList = document.querySelector("[data-demo-modules]");
  const metrics = document.querySelectorAll("[data-demo-metric]");

  if (!title || !inputList || !blueprintList || !moduleList) {
    return;
  }

  title.textContent = scenario.title;
  inputList.innerHTML = scenario.inputs.map((item) => `<li>${item}</li>`).join("");
  blueprintList.innerHTML = scenario.blueprint.map((item) => `<li>${item}</li>`).join("");
  moduleList.innerHTML = scenario.modules.map((item) => `<li>${item}</li>`).join("");

  for (let index = 0; index < metrics.length; index += 1) {
    metrics[index].textContent = scenario.metrics[index] ?? "";
  }
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
  for (const form of document.querySelectorAll("[data-mailto-form]")) {
    let submitted = false;
    const status = form.querySelector("[data-form-status]");

    form.addEventListener("submit", (event) => {
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

      const data = new FormData(form);
      const subject = encodeURIComponent(form.dataset.subject ?? "Xygo inquiry");
      const body = encodeURIComponent(Array.from(data.entries())
        .filter(([key, value]) => key !== "website" && String(value).trim())
        .map(([key, value]) => `${key}: ${value}`)
        .join("\n"));

      submitted = true;
      status.textContent = "Opening an email draft. No backend submission is configured yet, so nothing is silently stored or sent from the website.";
      status.className = "form-status success";
      window.location.href = `mailto:hello@xygo.pro?subject=${subject}&body=${body}`;
    });
  }
}

syncHeader();
markActivePage();
revealContent();
renderDemoScenario();
setupDemoControls();
setupForms();

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
