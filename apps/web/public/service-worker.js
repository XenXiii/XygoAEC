const CACHE_VERSION = "xygo-shell-v1";
const SHELL_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL, "/workspace.html", "/styles.css", "/release-shell.css", "/pwa-client.js",
  "/release-shell.js", "/favicon.svg", "/icons/xygo-192.png", "/icons/xygo-512.png"
];
const CACHEABLE_PATHS = new Set(PRECACHE);
const PRIVATE_PREFIXES = ["/auth/", "/v1/", "/uploads/", "/files/"];
const NEVER_CACHE = new Set(["/runtime-config.json"]);

function privateRequest(request, url) {
  return request.method !== "GET" || url.origin !== self.location.origin ||
    PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
    NEVER_CACHE.has(url.pathname) || request.headers.has("authorization");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("xygo-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (privateRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (CACHEABLE_PATHS.has(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok && response.type === "basic") caches.open(SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
  }
});
