import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/services.html"), "utf8");
const index = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/index.html"), "utf8");

test("plans page lists the approved four tiers", () => {
  assert.match(html, />Basic</);
  assert.match(html, />Premium</);
  assert.match(html, />Business</);
  assert.match(html, />Enterprise</);
});

test("plans page shows introductory and renewal pricing honestly", () => {
  assert.match(html, /\$7/);
  assert.match(html, /\$25\/month/);
  assert.match(html, /\$50\/month/);
  assert.match(html, /\$49/);
  assert.match(html, /\$250\/month/);
  assert.match(html, /Checkout is not yet active/);
});

test("plans route users to a real contact flow", () => {
  assert.match(html, /href="\/contact">Choose Basic/);
  assert.match(html, /href="\/contact">Talk to Xygo/);
});

test("home page navigation links to services", () => {
  assert.match(index, /href="\/services"/);
});
