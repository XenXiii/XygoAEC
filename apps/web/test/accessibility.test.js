import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/index.html"), "utf8");
const css = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/demo.css"), "utf8");

test("homepage summary includes skip navigation and landmark structure", () => {
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main[^>]+id="main-content"/);
  assert.match(html, /Your Business Should Run on a System Built for Your Business/);
});

test("homepage uses the required public navigation and demo CTA", () => {
  assert.match(html, /href="\/about">About/);
  assert.match(html, /href="\/mission">Mission/);
  assert.match(html, /href="\/investors">Investor Relations/);
  assert.match(html, /href="\/demo">Request a Demo/);
  assert.doesNotMatch(html, /href="\/control-room.html">Open staged workspace/);
});

test("web runtime provides visible focus and reduced-motion support", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("required public routes exist as static pages", () => {
  for (const route of ["about", "mission", "investors", "demo", "contact"]) {
    assert.ok(fs.existsSync(path.resolve(process.cwd(), `apps/web/public/${route}.html`)));
  }
});
