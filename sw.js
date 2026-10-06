/* Go Do service worker: shows phone notifications, keeps the app icon's badge number up to date, and keeps a copy
   of the app's code and font files. Those files have a fingerprint in their name (entry-<hash>.js), so a copy can
   never be out of date — a new version of the app has new names. The feed's data files come from the network first and
   only a last copy is kept for no signal (latestData), and pages always come from the network first, so new versions and new listings still load right away. The last app page is
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
          // Only use the kept page when its code is kept too — otherwise it would open to a blank screen. The app
          // comes in parts (scripts/web-chunks.mjs); the ones every screen needs are the runtime, the shared code and
          // the start (entry). A screen's own file that isn't kept shows the app's "try again" instead.
          const names = html ? [...new Set(html.match(/(__expo-metro-runtime|__common|entry)-[a-f0-9]+\.js/g) || [])] : [];
          if (!names.some((n) => n.startsWith('entry-'))) return offline;
          return caches
            .open(CODE_CACHE)
            .then((c) => Promise.all(names.map((n) => c.match(codeUrl(n)))))
            .then((hits) => (hits.every(Boolean) ? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : offline));
        })
        .catch(() => new Response(OFFLINE_PAGE, { headers: { 'content-type': 'text/html; charset=utf-8' } })),
    );
}

const JS_DIR = '_expo/static/js/web/';
const codeUrl = (name) => new URL(JS_DIR + name, self.registration.scope).href;
const isAppFile = (url) => url.startsWith(new URL(JS_DIR, self.registration.scope).href);

/** Keep the copy small: the app's own files are tidied by version (keepVersion); fonts and pictures, the newest 60. */
function trimOthers() {
  return caches.open(CODE_CACHE).then((c) =>
    c.keys().then((keys) => {
      const others = keys.filter((k) => !isAppFile(k.url));
      return Promise.all(others.slice(0, Math.max(0, others.length - 60)).map((k) => c.delete(k)));
    }),
  );
}

/**
 * The page asks after it has loaded (scripts/web-chunks.mjs). The app comes in parts, one per screen, downloaded
 * when first opened. Files of older versions are let go (a page still open on an old version just downloads what it
 * needs again). With `keep` (the Home Screen app, or a member), every file of the current version is kept, so any
 * screen opens with no signal — about as much as the old single file, and only files that changed are fetched.
 */
function keepVersion(keep) {
  return fetch(new URL('version.json', self.registration.scope).href, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => {
      if (!v || !Array.isArray(v.files) || !v.files.length) return;
      const want = new Set(v.files.map(codeUrl));
      return caches.open(CODE_CACHE).then((c) =>
        c
          .keys()
          .then((keys) => Promise.all(keys.filter((k) => isAppFile(k.url) && !want.has(k.url)).map((k) => c.delete(k))))
          .then(() => {
            if (!keep) return;
            const todo = [...want];
            // A few at a time, so it doesn't crowd out what the person is doing.
            const next = () => {
              const url = todo.shift();
              if (!url) return Promise.resolve();
              return c
                .match(url)
                .then((hit) => hit || fetch(url).then((res) => (res.ok && res.type === 'basic' ? c.put(url, res) : null)))
                .catch(() => {})
                .then(next);
            };
            return Promise.all([next(), next(), next()]);
          }),
      );
    })
    .catch(() => {});
}

/**
 * The listings the feed opens with — the next 14 days (events-soon.json), the whole list (events-list.json) and the
 * activities: always from the network first (so they're never out of date), with the last copy kept for opening with
 * no signal (then the app shows those instead of its older built-in copy). One copy of each file.
 */
const DATA_CACHE = 'godo-data-v1';
const DATA = /^\/(events-soon|events-list|activities)\.json$/;
function latestData(req) {
  return fetch(req)
    .then((res) => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches
          .open(DATA_CACHE)
          .then((c) => c.put(new URL(req.url).pathname, copy))
          .catch(() => {});
      }
      return res;
    })
    .catch((err) =>
      caches
        .open(DATA_CACHE)
        .then((c) => c.match(new URL(req.url).pathname))
        .then((hit) => {
          if (hit) return hit;
          throw err;
        }),
    );
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(Promise.all([self.clients.claim(), trimOthers()]).catch(() => {})));
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'godo-code') e.waitUntil(Promise.all([keepVersion(!!e.data.keep), trimOthers()]));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') return e.respondWith(openPage(req));
  if (DATA.test(url.pathname)) return e.respondWith(latestData(req));
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
