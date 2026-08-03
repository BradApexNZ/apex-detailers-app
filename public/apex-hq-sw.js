const CACHE_NAME = "apex-hq-shell-v2";
const CORE_URLS = [
  "/apex-hq.webmanifest",
  "/apex-logo-official.svg"
];

async function cacheUrl(cache, url) {
  try {
    const response = await fetch(url, { cache: "reload" });
    if (response.ok && response.type === "basic") {
      await cache.put(url, response);
    }
  } catch {
    // Individual optional assets must not prevent the app shell installing.
  }
}

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch("/hq", { cache: "reload" });
  if (!response.ok) throw new Error("Apex HQ shell could not be downloaded.");

  const html = await response.clone().text();
  await cache.put("/hq", response.clone());
  await cache.put("/hq.html", new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  }));

  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter(url => url.startsWith("/") && url !== "/apex-hq-sw.js");

  await Promise.all([
    ...CORE_URLS.map(url => cacheUrl(cache, url)),
    ...[...new Set(assetUrls)].map(url => cacheUrl(cache, url))
  ]);
}

self.addEventListener("install", event => {
  event.waitUntil(precacheAppShell().then(() => self.skipWaiting()));
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
