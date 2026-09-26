// Minimal worker so /admin can be installed as a home-screen app. It never
// caches anything: approvals must always act on live data, so every request
// goes straight to the network exactly as if there were no worker.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
