import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/demo.html"), "utf8");
const css = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/demo.css"), "utf8");

test("demo preview includes skip navigation and semantic landmarks", () => {
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main[^>]+id="main-content"/);
  assert.match(html, /<nav[^>]+aria-label="Primary"/);
});

test("demo preview discloses staged data and human oversight", () => {
  assert.match(html, /Synthetic Data/);
  assert.match(html, /Human Oversight/);
  assert.match(html, /Non-production environment/);
});

test("demo preview styles include focus states and reduced motion support", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
