/* Go Do service worker: shows phone notifications, keeps the app icon's badge number up to date, and keeps a copy
   of the app's code and font files. Those files have a fingerprint in their name (entry-<hash>.js), so a copy can
   never be out of date — a new version of the app has new names. Pages and data (index.html, events.json…) are never
   cached here, so new versions and new listings still load right away. */
const CODE_CACHE = 'godo-code-v1';
const IMMUTABLE = /\/(_expo\/static|assets)\//;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Keep the copy small: the newest 40 files.
      caches.open(CODE_CACHE).then((c) => c.keys().then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - 40)).map((k) => c.delete(k))))),
    ]).catch(() => {}),
  ),
);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !IMMUTABLE.test(url.pathname)) return;
  e.respondWith(
    caches.open(CODE_CACHE).then((c) =>
      c.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') c.put(req, res.clone()).catch(() => {});
            return res;
          }),
      ),
    ),
  );
});

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
