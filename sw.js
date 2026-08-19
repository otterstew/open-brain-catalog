// Open Brain catalog service worker.
//
// Caches the app shell so the catalog opens instantly and survives a dead
// connection. Archive traffic is deliberately NOT cached: those are POSTs
// carrying the access key, and stale notes would be worse than none.
// Bump SHELL_VERSION whenever the shell files change: the browser only re-runs
// install when this script's bytes differ, and the cache name goes with it.
const SHELL_VERSION = 28;
const CACHE = 'open-brain-shell-v' + SHELL_VERSION;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                       // archive calls are POSTs
  if (new URL(req.url).origin !== self.location.origin) return;  // fonts, API, anything remote

  // Shell assets: serve from cache, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const live = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || live;
    })
  );
});
