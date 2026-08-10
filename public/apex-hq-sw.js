const CACHE_NAME = "apex-hq-assets-v4";
const OFFLINE_URL = "/hq";
const CORE_URLS = [
  "/apex-hq.webmanifest",
  "/apex-logo-official.svg"
];

async function cacheOptionalAsset(cache, url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (response.ok && response.type === "basic") {
      await cache.put(url, response.clone());
    }
  } catch {
    // Optional assets must never block worker installation.
  }
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_URLS.map(url => cacheOptionalAsset(cache, url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith("apex-hq-") || key.startsWith("apex-hq-shell-") || key.startsWith("apex-hq-assets-"))
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

async function fetchFresh(request) {
  return fetch(new Request(request, { cache: "no-store" }));
}

async function networkFirstNavigation(request) {
  try {
    // Never serve a cached HQ document while online. This prevents an old HTML shell
    // from referencing obsolete JS/CSS after a Firebase preview or production deploy.
    return await fetchFresh(request);
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const fallback = await cache.match(OFFLINE_URL);
    if (fallback) return fallback;
    return Response.error();
  }
}

async function networkFirstAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetchFresh(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/apex-hq-sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isStaticAsset = ["script", "style", "image", "font", "manifest"].includes(request.destination);
  if (isStaticAsset) {
    event.respondWith(networkFirstAsset(request));
  }
});
