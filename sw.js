// Open Brain catalog service worker.
//
// Caches the app shell so the catalog opens instantly and survives a dead
// connection. Archive traffic is deliberately NOT cached: those are POSTs
// carrying the access key, and stale notes would be worse than none.
// Bump SHELL_VERSION whenever the shell files change: the browser only re-runs
// install when this script's bytes differ, and the cache name goes with it.
const SHELL_VERSION = 59;
const CACHE = 'open-brain-shell-v' + SHELL_VERSION;
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  // The flashcards app: its own page, manifest and icons, same shell cache.
  './cards.html',
  './cards.webmanifest',
  './cards-192.png',
  './cards-512.png',
  './prep.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' skips the browser's HTTP cache. GitHub Pages serves
      // everything max-age=600, so a plain addAll could store the page it had
      // cached ten minutes earlier under the new version's name — a fresh
      // service worker holding the old catalog. Found 24 Sep 2026 (v45).
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
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

  // The page itself: network first, so a reload shows what was last published;
  // the cached copy is only for when there is no connection. Serving it cache-
  // first meant every release needed two reloads, and sometimes more.
  if (req.mode === 'navigate') {
    event.respondWith(
      // By URL: a navigate-mode Request cannot be re-issued with new options
      // (fetch(req, init) throws), and the throw would silently serve the cache.
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
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

  // Other shell assets: serve from cache, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const live = fetch(req, { cache: 'no-cache' })
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
