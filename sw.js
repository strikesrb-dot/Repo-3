/* ELT service worker — network-first with offline cache fallback */
const CACHE = 'elt-v7';
const CORE = ['./', './index.html', './manifest.webmanifest', './aircraft.json', './equipment.json',
              './staffing.js', './staffing.css', './preview.js', './preview.css', './bids.json', './vendor/pdf.min.mjs', './vendor/pdf.worker.min.mjs',
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

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // network-first: fresh when online, cached when offline
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
