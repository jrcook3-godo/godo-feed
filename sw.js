/* Go Do service worker: shows phone notifications and keeps the app icon's badge number up to date.
   It deliberately caches nothing, so new versions of the app still load right away. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (err) {
    d = { body: e.data ? e.data.text() : '' };
  }
  const jobs = [
    self.registration.showNotification(d.title || 'Go Do', {
      body: d.body || 'You have something new on Go Do',
      icon: 'icons/icon-192.png',
      tag: d.tag,
      renotify: !!d.tag,
      data: { url: d.url || 'notifications' },
    }),
  ];
  const nav = self.navigator;
  if (typeof d.badge === 'number' && nav && nav.setAppBadge) {
    jobs.push(d.badge > 0 ? nav.setAppBadge(d.badge) : nav.clearAppBadge());
  }
  e.waitUntil(Promise.all(jobs).catch(() => {}));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          return c.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : w));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
