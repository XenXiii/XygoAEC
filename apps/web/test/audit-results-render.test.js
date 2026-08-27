import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8");

// Structural guards that complement the behavioral tests in audit-results-view.test.js.
test("results tiles ship neutral defaults, never fixture numbers, in static markup", () => {
  const html = read("app.html");
  for (const id of ["result-health", "result-health-bar", "result-opportunities", "result-revenue", "result-issues", "result-automation",
    "result-opportunities-note", "result-revenue-note", "result-issues-note", "result-automation-note"]) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} hook must exist`);
  }
  // Default values are neutral placeholders, not 78 / $42K / 3 / 2 / 1.
  assert.match(html, /id="result-health">—<\/span>/);
  assert.match(html, /id="result-revenue">—<\/span>/);
  assert.doesNotMatch(html, /id="result-health">78/);
  assert.doesNotMatch(html, /id="result-revenue">\$42K/);
  // Approved unit suffixes preserved.
  assert.match(html, /<small>\/100<\/small>/);
  assert.match(html, /<small>\/year<\/small>/);
});

test("fabricated tenant blocks are marked fixture-only and have real-mode placeholders", () => {
  const html = read("app.html");
  assert.match(html, /class="attention" data-fixture-only/);
  assert.match(html, /class="kpi-strip"[^>]*data-fixture-only/);
  assert.match(html, /class="business-brief" data-fixture-only/);
  assert.match(html, /class="artifact-panel" data-fixture-only/);
  assert.match(html, /class="context-panel" data-fixture-only/);
  assert.match(html, /data-real-only/);
});

test("app shell is server-authoritative: view module, no innerHTML, single fixture source", () => {
  const js = read("app-shell.js");
  assert.match(js, /from "\.\/audit-results-view\.js"/);
  assert.match(js, /auditTiles|unavailableTiles|loadingTiles/);
  assert.match(js, /function applyFixtureVisibility/);
  assert.match(js, /\/audit-result/);
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /innerHTML/);
  // Fixture numbers come only from the shared PREVIEW_AUDIT_RESULT, not inline literals.
  assert.match(js, /auditResult:PREVIEW_AUDIT_RESULT/);
  assert.doesNotMatch(js, /businessHealth:\{score:78\}/);
});
