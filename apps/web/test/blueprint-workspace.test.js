import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/blueprint.html"), "utf8");
const css = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/blueprint.css"), "utf8");

test("blueprint workspace includes staged review landmarks", () => {
  assert.match(html, /Blueprint Review Workspace/);
  assert.match(html, /id="main-content"/);
  assert.match(html, /id="finding-list"/);
  assert.match(html, /id="conversion-form"/);
});

test("blueprint workspace styles include focus states and responsive layout", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 1100px\)/);
});
