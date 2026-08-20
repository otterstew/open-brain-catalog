// Open Brain catalog service worker.
//
// Caches the app shell so the catalog opens instantly and survives a dead
// connection. Archive traffic is deliberately NOT cached: those are POSTs
// carrying the access key, and stale notes would be worse than none.
// Bump SHELL_VERSION whenever the shell files change: the browser only re-runs
// install when this script's bytes differ, and the cache name goes with it.
// Keep in step with the build stamp on the drawer title in index.html.
const SHELL_VERSION = 31;
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

  // The page itself is fetched fresh whenever the network allows. Serving the
  // cached copy first meant a browser kept rendering the *previous* build until
  // the second reload after a deploy — which reads as a layout bug that only
  // happens on one machine, on one browser, and cannot be reproduced anywhere
  // else. Only when the network is gone does the cached page stand in.
  const path = new URL(req.url).pathname;
  if (req.mode === 'navigate' || path.endsWith('/') || path.endsWith('/index.html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // Everything else in the shell — icons, manifest — is versioned by cache name
  // and small: serve from cache, refresh in the background.
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
