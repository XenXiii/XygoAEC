const nav = document.querySelector("#nav");
const reveals = document.querySelectorAll(".reveal");
const counters = document.querySelectorAll(".counter");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function syncNav() {
  nav?.classList.toggle("scrolled", window.scrollY > 8);
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
  }, { threshold: 0.18 });

  for (const element of reveals) {
    observer.observe(element);
  }
}

function animateCounters() {
  for (const element of counters) {
    const target = Number(element.dataset.target ?? "0");

    if (!Number.isFinite(target)) {
      continue;
    }

    if (reduceMotion) {
      element.textContent = String(target);
      continue;
    }

    const durationMs = 900;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = String(Math.round(target * eased));

      if (progress < 1) {
        window.requestAnimationFrame(tick);
      }
    }

    window.requestAnimationFrame(tick);
  }
}

syncNav();
revealContent();
animateCounters();

window.addEventListener("scroll", syncNav, { passive: true });
