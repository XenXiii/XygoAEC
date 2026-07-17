import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(path.resolve(process.cwd(), "apps/web/public/platform.html"), "utf8");

test("platform page describes the blueprint and module system", () => {
  assert.match(html, /Business Intake/);
  assert.match(html, /Module Library/);
  assert.match(html, /Field Reporting/);
  assert.match(html, /Client Portal/);
  assert.match(html, /Non-production environment/);
});

