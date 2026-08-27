import test from "node:test";
import assert from "node:assert/strict";

// A minimal executed DOM: enough of the browser surface to run the real
// app-shell.js functions and observe the nodes they mutate. No dependency.
function makeEl(tag = "div") {
  let text = "";
  const el = {
    tagName: tag, hidden: false, style: {}, dataset: {}, attributes: {}, children: [], tabIndex: 0, value: "", open: false, scrollTop: 0, scrollHeight: 0,
    classList: (() => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c), toggle: (c, f) => { const on = f === undefined ? !s.has(c) : f; on ? s.add(c) : s.delete(c); return on; } }; })(),
    append(...n) { this.children.push(...n); },
    replaceChildren(...n) { this.children = [...n]; },
    addEventListener() {}, removeEventListener() {},
    setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k] ?? null; },
    showModal() { this.open = true; }, close() { this.open = false; },
    remove() {}, closest() { return null; }, checkValidity() { return true; }, reportValidity() {}, focus() {},
    querySelector() { return makeEl(); }, querySelectorAll() { return []; }
  };
  Object.defineProperty(el, "textContent", { get: () => text, set: (v) => { text = String(v); el.children = []; } });
  return el;
}

function makeDoc() {
  const byId = new Map();
  const fixtureOnly = [makeEl("section"), makeEl("aside")];
  const realOnly = [makeEl("div")];
  const node = (id) => { if (!byId.has(id)) byId.set(id, makeEl()); return byId.get(id); };
  return {
    byId, fixtureOnly, realOnly, body: makeEl("body"), documentElement: makeEl("html"),
    getElementById: (id) => node(id),
    querySelector(sel) {
      if (sel.startsWith("#")) return node(sel.slice(1));
      if (sel === "[data-fixture-only]") return fixtureOnly[0];
      if (sel === "[data-real-only]") return realOnly[0];
      return makeEl();
    },
    querySelectorAll(sel) {
      if (sel === "[data-fixture-only]") return fixtureOnly;
      if (sel === "[data-real-only]") return realOnly;
      if (sel.startsWith("#")) return [node(sel.slice(1))];
      return [];
    },
    createElement: (t) => makeEl(t), createTextNode: (t) => { const n = makeEl("#text"); n.textContent = t; return n; },
    addEventListener() {}
  };
}

let routes = [];
function installGlobals(doc, { search = "", protocol = "https:" } = {}) {
  globalThis.document = doc;
  globalThis.location = { protocol, search, assign() {}, reload() {}, href: "" };
  globalThis.sessionStorage = { getItem: () => null, setItem() {} };
  globalThis.fetch = async (url) => {
    for (const [needle, respond] of routes) if (String(url).includes(needle)) return respond();
    return { ok: false, json: async () => ({ message: "not mocked" }) };
  };
}
const ok = (data) => ({ ok: true, json: async () => data });
const fail = () => ({ ok: false, json: async () => ({ message: "boom" }) });
const tick = () => new Promise((r) => setImmediate(r));

// Import once with a file: URL so the module's auto-boot() is a no-op; then drive
// the exported real functions, swapping globalThis.document per scenario.
installGlobals(makeDoc(), { protocol: "file:" });
const shell = await import("../public/app-shell.js");
const T = shell.__appShellTest;

test("(loading + success) authenticated load shows neutral placeholders, then server values", async () => {
  const doc = makeDoc(); installGlobals(doc);
  routes = [["audit-result", () => ok({ item: { businessHealth: { score: 61, kind: "inference" }, opportunityCount: 1, potentialAnnualRevenue: { amount: 45408, kind: "projection", confidence: "medium", timeHorizon: "12 months" }, growthOpportunities: [{ assumptions: [] }], operationalIssueCount: 0, recommendedAutomation: null } })]];
  T.setPreview(false);
  T.setCurrent({ workspace: { id: "fixture-legit" }, conversation: { id: "c" } });
  const p = T.loadAuditResult();
  // Synchronous loading state — no fixture numbers.
  assert.equal(doc.getElementById("result-health").textContent, "—");
  assert.equal(doc.getElementById("result-revenue").textContent, "—");
  assert.equal(doc.getElementById("result-revenue-note").textContent, "Loading…");
  await p;
  assert.equal(doc.getElementById("result-health").textContent, "61");
  assert.equal(doc.getElementById("result-revenue").textContent, "$45K");
  assert.equal(doc.getElementById("result-opportunities").textContent, "1");
});

test("(failure) a failed result fetch renders the explicit unavailable state", async () => {
  const doc = makeDoc(); installGlobals(doc);
  routes = [["audit-result", () => fail()]];
  T.setPreview(false);
  T.setCurrent({ workspace: { id: "fixture-legit" }, conversation: { id: "c" } });
  await T.loadAuditResult();
  assert.equal(doc.getElementById("result-health").textContent, "—");
  assert.equal(doc.getElementById("result-revenue-note").textContent, "Results temporarily unavailable");
});

test("(real-mode hiding) live mode hides fixture-only blocks and reveals real-only placeholders", () => {
  const doc = makeDoc(); installGlobals(doc);
  T.applyFixtureVisibility(false);
  assert.equal(doc.fixtureOnly[0].hidden, true);
  assert.equal(doc.fixtureOnly[1].hidden, true);
  assert.equal(doc.realOnly[0].hidden, false);
});

test("(fixture-mode display) preview shows fixture-only blocks and hides real-only placeholders", () => {
  const doc = makeDoc(); installGlobals(doc);
  T.applyFixtureVisibility(true);
  assert.equal(doc.fixtureOnly[0].hidden, false);
  assert.equal(doc.realOnly[0].hidden, true);
});

test("(fixture-mode display) fixture boot renders exactly 78 / 3 / $42K / 2 / 1", async () => {
  const doc = makeDoc(); installGlobals(doc, { search: "?fixture=workspace" });
  await T.boot();
  await tick();
  assert.equal(T.getPreview(), true);
  assert.equal(doc.getElementById("result-health").textContent, "78");
  assert.equal(doc.getElementById("result-opportunities").textContent, "3");
  assert.equal(doc.getElementById("result-revenue").textContent, "$42K");
  assert.equal(doc.getElementById("result-issues").textContent, "2");
  assert.equal(doc.getElementById("result-automation").textContent, "1");
  assert.equal(doc.fixtureOnly[0].hidden, false, "fixture blocks are visible in preview");
});

test("(regression) an authenticated workspace named fixture-* is LIVE, never preview", async () => {
  const doc = makeDoc(); installGlobals(doc, { search: "?conversation=c" });
  routes = [
    ["session/workspaces", () => ok({ items: [{ workspace: { id: "fixture-legit", displayName: "Real Co" }, role: "owner" }] })],
    ["audit-result", () => ok({ item: { businessHealth: { score: 61, kind: "inference" }, opportunityCount: 1, potentialAnnualRevenue: { amount: 45408, kind: "projection", confidence: "medium" }, growthOpportunities: [{ assumptions: [] }], operationalIssueCount: 0, recommendedAutomation: null } })],
    ["billing/entitlement", () => fail()],
    ["conversations/c", () => ok({ item: { conversation: { id: "c", title: "Audit" }, messages: [], canvas: { projection: {} }, state: { freeResultEligible: false, readiness: 0 }, evidence: [] } })]
  ];
  await T.boot();
  await tick(); await tick();
  // Despite the fixture-* id, this restored session is live.
  assert.equal(T.getPreview(), false, "authenticated fixture-* must not enter preview mode");
  assert.equal(doc.body.dataset.mode, "live");
  assert.equal(doc.fixtureOnly[0].hidden, true, "fabricated tenant blocks stay hidden for a real user");
  // Real server values, not fixture numbers.
  assert.equal(doc.getElementById("result-health").textContent, "61");
  assert.equal(doc.getElementById("result-revenue").textContent, "$45K");
  // No fixed preview recommendations leaked in — empty state instead.
  const rec = doc.getElementById("recommendation-list");
  assert.equal(rec.children.length, 1);
  assert.match(rec.children[0].textContent, /No recommendations yet/);
});
