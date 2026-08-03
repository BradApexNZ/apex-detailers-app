const CACHE_NAME = "apex-hq-shell-v1";
const PRECACHE_URLS = [
  "/hq",
  "/hq.html",
  "/apex-hq.webmanifest",
  "/apex-logo-official.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("apex-hq-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkWithCacheFallback(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (request.mode === "navigate") {
      const fallback = await cache.match("/hq.html");
      if (fallback) return fallback;
    }

    return Response.error();
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/apex-hq-sw.js") return;

  const isNavigation = request.mode === "navigate";
  const isStaticAsset = ["script", "style", "image", "font", "manifest"].includes(request.destination);

  if (isNavigation || isStaticAsset) {
    event.respondWith(networkWithCacheFallback(request));
  }
});
