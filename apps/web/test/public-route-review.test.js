import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const publicDir = path.resolve(process.cwd(), "apps/web/public");
const routes = ["demo", "business-audit", "services", "about", "contact", "mission", "investors", "privacy", "privacy-choices", "terms", "accessibility"];
const routeFiles = routes.map((route) => `${route}.html`);

test("primary public routes use shared XYGO chrome and accessibility landmarks", () => {
  for (const file of routeFiles) {
    const html = fs.readFileSync(path.join(publicDir, file), "utf8");
    assert.match(html, /href="\/demo\.css"/, `${file} must use the shared visual system`);
    assert.match(html, /class="site-header"/, `${file} must use shared navigation`);
    assert.match(html, /class="skip-link"/, `${file} must provide skip navigation`);
    assert.match(html, /id="main-content"/, `${file} must provide a main target`);
    assert.match(html, /class="footer"/, `${file} must use the shared footer`);
  }
});

test("internal public links resolve to a file or a known root anchor", () => {
  for (const file of routeFiles) {
    const html = fs.readFileSync(path.join(publicDir, file), "utf8");
    for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) {
      const [pathAndQuery, hash] = href.split("#");
      const pathname = pathAndQuery.split("?")[0];
      if (["/api/contact", "/api/privacy-request"].includes(pathname)) continue;
      const relative = pathname.replace(/^\//, "");
      const target = pathname === "/" ? "index.html" : path.extname(relative) ? relative : `${relative}.html`;
      assert.ok(fs.existsSync(path.join(publicDir, target)), `${file}: broken link ${href}`);
      if (hash && pathname === "/") {
        const home = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
        assert.match(home, new RegExp(`id=["']${hash}["']`), `${file}: missing home anchor ${hash}`);
      }
    }
  }
});

test("shared design includes visible focus, responsive navigation, and reduced motion", () => {
  const css = fs.readFileSync(path.join(publicDir, "demo.css"), "utf8");
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /prefers-reduced-motion/);
});
