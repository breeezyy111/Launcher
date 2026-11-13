// Network-first for everything, so updates show up right away; the cache is only the offline fallback.
const CACHE = 'launcher-v18';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/superink.svg', 'orca/icons/icon.svg', 'icons/stellar-forge.svg', 'icons/neon-drift.svg', 'icons/fusion.svg', 'icons/jot.svg', 'icons/focus.svg', 'icons/krazy-kombat.svg', 'icons/snake.svg', 'icons/stackfall.svg', 'icons/comet.svg', 'icons/sky-hopper.svg', 'icons/block-bash.svg', 'icons/turbo-tanks.svg', 'icons/dungeon-dash.svg', 'icons/rhythm-rush.svg', 'icons/gravity-golf.svg', 'icons/zombie-holdout.svg', 'icons/word-blitz.svg', 'icons/tiny-roads.svg', 'icons/grid-pop.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // 'no-cache' makes the browser re-check with the server instead of trusting its saved copy.
  e.respondWith(
    fetch(e.request.url, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
