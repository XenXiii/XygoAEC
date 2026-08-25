import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const root = path.resolve(process.cwd(), "apps/web/public");
const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
const page = fs.readFileSync(path.join(root, "privacy-choices.html"), "utf8");
const script = fs.readFileSync(path.join(root, "privacy-choices.js"), "utf8");

test("homepage exposes a privacy-choice control", () => {
  assert.match(home, /href="\/privacy-choices"/);
  assert.match(home, />Your Privacy Choices</);
});

test("privacy page offers sale-sharing opt out and data rights", () => {
  assert.match(page, /do_not_sell_or_share/);
  assert.match(page, /value="access"/);
  assert.match(page, /value="correction"/);
  assert.match(page, /value="deletion"/);
  assert.match(script, /\/api\/privacy-request/);
});

