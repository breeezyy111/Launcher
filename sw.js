// Network-first, so updates show up right away, but never left hanging: if the network is
// slow or gone, the cached copy answers. Every built-in app is cached on install, so the
// launcher and its games work offline.
const CACHE = 'launcher-v21';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'apps.json', 'manifest.webmanifest', 'icons/icon.svg'];
// Files built-in apps load themselves (not listed in apps.json).
const EXTRAS = ['orca/app.js', 'orca/config.js', 'orca/style.css', 'orca/vendor/marked.min.js', 'orca/vendor/purify.min.js',
  'word-blitz/words.txt', 'word-blitz/common.txt'];
const NETWORK_TIMEOUT = 3000;

// Every same-origin app page and icon from apps.json, so new apps need no edit here.
async function appFiles(cache) {
  try {
    const res = await cache.match('apps.json');
    const { apps = [] } = await res.json();
    const files = [];
    for (const a of apps) {
      for (const u of [a.url, a.icon]) {
        if (!u || /^[a-z][a-z0-9+.-]*:/i.test(u) || u.startsWith('//')) continue; // external
        files.push(u);
      }
    }
    return files;
  } catch { return []; }
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Best effort: one missing file shouldn't stop the launcher from installing.
    const rest = [...EXTRAS, ...(await appFiles(cache))];
    await Promise.all(rest.map((u) => cache.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
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
  e.respondWith((async () => {
    const cached = caches.match(e.request, { ignoreSearch: true });
    // 'no-cache' makes the browser re-check with the server instead of trusting its saved copy.
    const network = fetch(e.request.url, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    });
    // Whichever comes first: a network answer, or the cache once the network is slow/failed.
    const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT));
    try {
      const res = await Promise.race([network, timeout.then(() => cached)]);
      if (res) return res;
    } catch { /* offline */ }
    return (await cached) || network;
  })());
});
