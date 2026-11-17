/* orlaz service worker -- watchlist alerts only (no caching, no offline).
   The push carries no payload: on a push we ask our own API what happened for
   this subscription, then show it. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let events = [];
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) {
          const r = await fetch("/api/push/inbox", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          if (r.ok) events = (await r.json()).events || [];
        }
      } catch (_) {}
      // Browsers require a visible notification per push; fall back to a plain
      // one if the inbox could not be read.
      if (!events.length) {
        await self.registration.showNotification("orlaz", { body: "A game on your watchlist has an update.", tag: "orlaz-generic", data: { url: "/watchlist" } });
        return;
      }
      for (const e of events) {
        await self.registration.showNotification(e.title, {
          body: e.text,
          tag: "orlaz-" + e.id,
          icon: "/favicon.svg",
          data: { url: "/game/" + e.gameId },
        });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
