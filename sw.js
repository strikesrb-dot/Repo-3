/* ELT service worker — network-first with offline cache fallback */
const CACHE = 'elt-v34';
const CORE = ['./', './index.html', './manifest.webmanifest', './aircraft.json', './equipment.json',
              './store.js', './staffing.js', './staffing.css', './preview.js', './preview.css', './bids.json', './vendor/pdf.min.mjs', './vendor/pdf.worker.min.mjs',
              './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// let the page tell a waiting worker to take over right away
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // network-first, and bypass the browser HTTP cache so "fresh" is really fresh
  // (GitHub Pages sets max-age; without this the worker could serve stale-but-cached responses)
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      caches.open(CACHE).then(c => c.put(req, res.clone())).catch(() => {});
      return res;
    } catch (_) {
      const cached = await caches.match(req);
      return cached || caches.match('./index.html');
    }
  })());
});
