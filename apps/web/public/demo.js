const header = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
const reveals = document.querySelectorAll(".reveal");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

syncHeader();
markActivePage();
revealContent();

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
