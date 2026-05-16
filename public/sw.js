// Reid service worker — handles incoming web-push and click-to-open.
//
// Payload contract (set by src/lib/push.ts):
//   { title: string, body: string, url?: string }
//
// Icons reference /icon.svg because that's all we ship today. Browsers that
// reject SVG for the badge field simply omit the badge — the notification
// still renders.

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_e) {
    payload = {};
  }
  const title = payload.title || "Reid";
  const options = {
    body: payload.body || "",
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: payload.url || "/home" },
    tag: payload.tag || "reid-notification",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/home";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          // If the app is already open in a tab, focus it and navigate.
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) {
              try {
                client.navigate(targetUrl);
              } catch (_e) {
                // older browsers — fall through to openWindow
              }
            }
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});
