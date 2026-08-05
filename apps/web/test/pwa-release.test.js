import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const publicUrl = (name) => new URL(`../public/${name}`, import.meta.url);
const read = (name) => fs.readFileSync(publicUrl(name), "utf8");

test("PWA manifest is installable and production-safe", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.equal(manifest.name, "Xygo Workspace");
  assert.equal(manifest.start_url, "/workspace");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  for (const icon of manifest.icons) assert.ok(fs.statSync(publicUrl(icon.src.slice(1))).size > 0);
  assert.doesNotMatch(JSON.stringify(manifest), /secret|token|tenant-commercial|tenant-residential|localhost|127\.0\.0\.1/i);
});

test("service worker caches only the public shell and bypasses private traffic", () => {
  const worker = read("service-worker.js");
  for (const path of ["/auth/", "/v1/", "/uploads/", "/files/", "/runtime-config.json"]) assert.match(worker, new RegExp(path.replaceAll("/", "\\/")));
  assert.match(worker, /request\.headers\.has\("authorization"\)/);
  assert.match(worker, /request\.method !== "GET"/);
  assert.doesNotMatch(worker, /cache\.put\([^\n]*(auth|runtime-config|\/v1\/)/i);
  assert.doesNotMatch(worker.match(/const PRECACHE = \[[\s\S]*?\];/)?.[0] ?? "", /field-reports|client-portal|control-room|blueprint\.html/);
  assert.match(worker, /fetch\(request\)\.catch\(\(\) => caches\.match\(OFFLINE_URL\)\)/);
});

test("release surfaces include manifest, update client, and protected auth states", () => {
  for (const page of ["workspace.html", "control-room.html", "field-reports.html", "client-portal.html", "blueprint.html", "platform-blueprint.html"]) {
    const html = read(page);
    assert.match(html, /manifest\.webmanifest/);
    assert.match(html, /pwa-client\.js/);
    assert.match(html, /release-shell\.css/);
  }
  const auth = read("auth-client.js");
  const authSurface = `${auth}\n${read("release-shell.js")}`;
  for (const state of ["loading", "signed_out", "expired", "unauthorized", "ready"]) assert.match(authSurface, new RegExp(`\"${state}\"`));
  assert.doesNotMatch(auth, /localStorage|sessionStorage|caches\./);
  assert.match(read("workspace.html"), /Contractor reports/);
  assert.match(read("workspace.html"), /Client portal/);
  assert.match(read("workspace.html"), /Activation demo/);
  assert.match(read("workspace.html"), /Release status/);
});

test("web release cache headers force runtime and release metadata revalidation", () => {
  const vercel = JSON.parse(fs.readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"));
  const serialized = JSON.stringify(vercel.headers);
  assert.match(serialized, /runtime-config\.json.*no-store/);
  assert.match(serialized, /service-worker\.js.*no-cache/);
  assert.match(serialized, /manifest\.webmanifest.*no-cache/);
  assert.match(read("../src/server.js"), /application\/manifest\+json/);
});

test("PWA generated text assets contain no private configuration", () => {
  for (const name of ["manifest.webmanifest", "service-worker.js", "pwa-client.js", "release-shell.js", "workspace.html", "workspace.js", "offline.html"]) {
    assert.doesNotMatch(read(name), /BEGIN (RSA |EC )?PRIVATE KEY|XYGO_WEB_SESSION_SECRET|XYGO_WEB_SESSION_ENCRYPTION_KEY|refresh_token|client_secret/i, name);
  }
});
