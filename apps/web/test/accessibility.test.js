import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/index.html"), "utf8");
const css = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/styles.css"), "utf8");

test("web runtime includes skip navigation and landmark structure", () => {
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main[^>]+id="main-content"/);
  assert.match(html, /role="note"/);
});

test("web runtime includes aria-live regions for staged status updates", () => {
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="live-indicator"/);
});

test("web runtime provides visible focus and reduced-motion support", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
