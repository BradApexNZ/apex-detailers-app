// Minimal worker so /admin can be installed as a home-screen app. It never
// caches anything: approvals must always act on live data, so every request
// goes straight to the network exactly as if there were no worker.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

// New booking request pushes (sent by the registerOwnerDevice/pushToOwners
// functions as FCM data messages). iOS requires every push to show a notification.
self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const data = payload.data || payload;
  event.waitUntil(
    self.registration.showNotification(data.title || "Apex Admin", {
      body: data.body || "Something needs your attention.",
      icon: "/apex-icon-192.png",
      badge: "/apex-icon-192.png",
      tag: "apex-booking",
      renotify: true,
      data: { url: data.url || "/admin" }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      const open = windows.find(client => new URL(client.url).pathname.startsWith("/admin"));
      if (open) return open.focus();
      return self.clients.openWindow(url);
    })
  );
});
