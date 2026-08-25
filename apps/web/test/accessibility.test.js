import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/index.html"), "utf8");
const css = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/demo.css"), "utf8");
const contactHtml = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/contact.html"), "utf8");
const investorsHtml = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/investors.html"), "utf8");

test("homepage summary includes skip navigation and landmark structure", () => {
  assert.match(html, /class="skip-link"/);
  assert.match(html, /<main[^>]+id="main-content"/);
  assert.match(html, /Intelligence<br><span>that builds/);
});

test("homepage constellation progressively enhances the product story", () => {
  assert.match(html, /id="business-constellation"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /Find lost value/);
  assert.match(html, /Benchmark performance/);
  assert.match(html, /Build the fix/);
});

test("homepage uses the required public navigation and demo CTA", () => {
  assert.match(html, /href="\/about">About/);
  assert.match(html, /href="\/mission">Mission/);
  assert.match(html, /href="\/investors">Investor Relations/);
  assert.match(html, /href="\/demo">Start audit/);
  assert.doesNotMatch(html, /href="\/control-room.html">Open staged workspace/);
});

test("web runtime provides visible focus and reduced-motion support", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("required public and utility routes exist as static pages", () => {
  for (const route of ["about", "mission", "investors", "demo", "contact", "privacy", "terms", "accessibility", "404"]) {
    assert.ok(fs.existsSync(path.resolve(process.cwd(), `apps/web/public/${route}.html`)));
  }
});

test("seo support files exist", () => {
  assert.ok(fs.existsSync(path.resolve(process.cwd(), "apps/web/public/robots.txt")));
  assert.ok(fs.existsSync(path.resolve(process.cwd(), "apps/web/public/sitemap.xml")));
  assert.ok(fs.existsSync(path.resolve(process.cwd(), "apps/web/public/favicon.svg")));
});

test("contact and investor forms expose validation and secure email hooks", () => {
  assert.match(contactHtml, /data-email-form/);
  assert.match(contactHtml, /Inquiry type/);
  assert.match(contactHtml, /emailed securely to Xygo/);
  assert.match(investorsHtml, /Request Investor Materials/);
  assert.match(investorsHtml, /data-email-form/);
});
