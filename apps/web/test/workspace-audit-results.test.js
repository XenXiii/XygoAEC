import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8");

test("authenticated workspace ships neutral audit hooks without fixture values", () => {
  const html = read("workspace.html");
  for (const id of ["audit-health", "audit-opportunities", "audit-revenue", "audit-issues", "audit-automation", "audit-result-note"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(html, /\$42K|>78<|>3<\/strong>|>2<\/strong>|>1<\/strong>/);
});

test("workspace fetches the principal-scoped result and applies only textContent", () => {
  const source = read("workspace.js");
  assert.match(source, /authenticatedFetch/);
  assert.match(source, /\/v1\/session\/audit-result/);
  assert.match(source, /renderAuditTiles/);
  const renderBody = source.match(/function renderAuditTiles\(tiles\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(renderBody, /textContent/);
  assert.doesNotMatch(renderBody, /innerHTML/);
});
