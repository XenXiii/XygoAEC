import fs from "node:fs/promises";
import path from "node:path";

const cdpPort = Number(process.env.XYGO_CDP_PORT ?? 18800);
const baseUrl = process.env.XYGO_WEB_URL ?? "http://127.0.0.1:4173";
const outputDir = path.resolve(process.env.XYGO_VISUAL_OUTPUT ?? "artifacts/xygo-app-browser");
const states = ["default", "signed-out", "onboarding", "audit", "error", "reconnect"];
const widths = [390, 768, 1440, 1920];
const height = 1080;

const version = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((response) => {
  if (!response.ok) throw new Error(`Chrome DevTools endpoint returned ${response.status}`);
  return response.json();
});
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const listeners = new Set();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result ?? {});
    return;
  }
  for (const listener of listeners) listener(message);
});

function command(method, params = {}, sessionId) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function waitFor(method, sessionId, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      listeners.delete(listener);
      reject(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    const listener = (message) => {
      if (message.method !== method || message.sessionId !== sessionId) return;
      clearTimeout(timer);
      listeners.delete(listener);
      resolve(message.params ?? {});
    };
    listeners.add(listener);
  });
}

await fs.mkdir(outputDir, { recursive: true });
const results = [];

for (const state of states) {
  for (const width of widths) {
    const query = state === "default" ? "" : `?fixture=${encodeURIComponent(state)}`;
    const url = `${baseUrl}/app${query}`;
    const { targetId } = await command("Target.createTarget", { url: "about:blank", background: true });
    const { sessionId } = await command("Target.attachToTarget", { targetId, flatten: true });
    const consoleErrors = [];
    const runtimeErrors = [];
    const failedRequests = [];
    const listener = (message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
      }
      if (message.method === "Runtime.exceptionThrown") runtimeErrors.push(message.params.exceptionDetails.text);
      if (message.method === "Network.loadingFailed") failedRequests.push(message.params.errorText);
    };
    listeners.add(listener);
    await command("Page.enable", {}, sessionId);
    await command("Runtime.enable", {}, sessionId);
    await command("Network.enable", {}, sessionId);
    await command("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 768
    }, sessionId);
    const loaded = waitFor("Page.loadEventFired", sessionId);
    const navigation = await command("Page.navigate", { url }, sessionId);
    await loaded;
    await new Promise((resolve) => setTimeout(resolve, 150));
    const evaluation = await command("Runtime.evaluate", {
      expression: `(() => ({
        title: document.title,
        visibleState: [...document.querySelectorAll('main > section[id]')].find((node) => !node.hidden)?.id ?? null,
        fixtureDisclosed: !document.querySelector('#fixture-disclosure')?.hidden,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        stylesheetCount: document.styleSheets.length,
        appScriptLoaded: document.querySelector('#loading').hidden || document.body.dataset.fixture === 'true'
      }))()`,
      returnByValue: true
    }, sessionId);
    const screenshot = await command("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false
    }, sessionId);
    const screenshotName = `${state}-${width}.png`;
    await fs.writeFile(path.join(outputDir, screenshotName), Buffer.from(screenshot.data, "base64"));
    listeners.delete(listener);
    const data = evaluation.result.value;
    results.push({
      state,
      width,
      url,
      httpStatus: navigation.errorText ? null : 200,
      navigationError: navigation.errorText ?? null,
      ...data,
      consoleErrors,
      runtimeErrors,
      failedRequests,
      screenshot: screenshotName
    });
    await command("Target.closeTarget", { targetId });
  }
}

await fs.writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(results, null, 2)}\n`);
socket.close();

const failures = results.filter((result) =>
  result.httpStatus !== 200 ||
  result.navigationError ||
  result.overflow ||
  result.stylesheetCount < 2 ||
  !result.appScriptLoaded ||
  !result.visibleState ||
  result.consoleErrors.length ||
  result.runtimeErrors.length ||
  result.failedRequests.length ||
  (result.state !== "default" && !result.fixtureDisclosed)
);
process.stdout.write(`${JSON.stringify({ checks: results.length, failures, outputDir }, null, 2)}\n`);
process.exitCode = failures.length ? 1 : 0;
