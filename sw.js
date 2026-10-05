/* Go Do service worker: shows phone notifications, keeps the app icon's badge number up to date, and keeps a copy
   of the app's code and font files. Those files have a fingerprint in their name (entry-<hash>.js), so a copy can
   never be out of date — a new version of the app has new names. Data (events.json…) is never cached here, and pages
   always come from the network first, so new versions and new listings still load right away. The last app page is
   kept only as a fallback for opening the Home Screen app with no signal (before, iPhone showed "Safari can't open
   the page" with no way to reload); if even that isn't there, a small "You're offline" page with Try again. */
const CODE_CACHE = 'godo-code-v1';
const SHELL_CACHE = 'godo-shell-v1';
const SHELL_KEY = 'app-shell';
const IMMUTABLE = /\/(_expo\/static|assets)\//;

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Go Do · Offline</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1F4E7A;
color:#fff;font:16px/1.5 -apple-system,system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
button{margin-top:18px;background:#F5A400;color:#1F1F1F;border:0;border-radius:10px;padding:12px 28px;font-size:16px;font-weight:700}</style></head>
<body><div><h1 style="font-size:22px;margin:0 0 8px">You’re offline</h1><div>Go Do will load as soon as you’re back online.</div>
<button onclick="location.reload()">Try again</button></div><script>addEventListener('online',function(){location.reload()})</script></body></html>`;

/** Opening a page: the network first (always the newest app); with no connection, the last copy of the app, then the
 *  offline page. Only the app's own page is kept (not privacy.html and the like). */
function openPage(req) {
  return fetch(req)
    .then((res) => {
      if (res.ok && res.type === 'basic' && (res.headers.get('content-type') || '').includes('text/html')) {
        const copy = res.clone();
        copy
          .text()
          .then((html) => {
            if (!html.includes('/_expo/static/js/web/')) return;
            // A public page's words for search engines (scripts/seo.mjs) aren't kept: the app draws its own screen.
            const shell = html.replace(/<div class="seo"><main>[\s\S]*?<\/main><\/div>/, '');
            return caches.open(SHELL_CACHE).then((c) => c.put(SHELL_KEY, new Response(shell, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
          })
          .catch(() => {});
      }
      return res;
    })
    .catch(() =>
      caches
        .open(SHELL_CACHE)
        .then((c) => c.match(SHELL_KEY))
        .then((hit) => (hit ? hit.text() : null))
        .then((html) => {
          const offline = new Response(OFFLINE_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
          // Only use the kept page when its code is kept too — otherwise it would open to a blank screen.
          const src = html && (html.match(/[^"']*\/_expo\/static\/js\/web\/[^"']+\.js/) || [])[0];
          if (!src) return offline;
          return caches
            .open(CODE_CACHE)
            .then((c) => c.match(new URL(src, self.location.origin).href))
            .then((code) => (code ? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : offline));
        })
        .catch(() => new Response(OFFLINE_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
    );
}

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
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') return e.respondWith(openPage(req));
  if (!IMMUTABLE.test(url.pathname)) return;
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
