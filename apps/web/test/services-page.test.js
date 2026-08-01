import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/services.html"), "utf8");
const index = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/index.html"), "utf8");

test("services page lists all six offer packages", () => {
  assert.match(html, /AI Platform Blueprint/);
  assert.match(html, /AI Operations Audit/);
  assert.match(html, /AI Client Portal/);
  assert.match(html, /AI Field Report System/);
  assert.match(html, /AI Compliance Tracker/);
  assert.match(html, /Contractor Operating Dashboard/);
});

test("services page frames packages by the process replaced and stays staged-honest", () => {
  assert.match(html, /Replaces:/);
  assert.match(html, /Staged demo/);
  assert.match(html, /On the roadmap/);
  assert.match(html, /simulated/i);
});

test("live-demo packages link to their staged surfaces", () => {
  assert.match(html, /\/platform-blueprint\.html/);
  assert.match(html, /\/client-portal\.html/);
  assert.match(html, /\/field-reports\.html/);
});

test("home page navigation links to services", () => {
  assert.match(index, /href="\/services"/);
});
