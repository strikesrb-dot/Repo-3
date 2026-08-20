/* ELT service worker — network-first with offline cache fallback */
const CACHE = 'elt-v182';
const CORE = ['./', './index.html', './manifest.webmanifest', './aircraft.json', './equipment.json',
              './store.js', './staffing.js', './staffing.css', './ui.js', './ui.css', './requests.js', './requests.css',
              './gse.js', './gse.css', './equipment.js', './equipment.css', './inventory.js', './inventory.css', './movement.js',
              './vendor/pdf.min.mjs', './vendor/pdf.worker.min.mjs',
              './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  // precache with a cache-busting request so we never install a stale copy of core assets.
  // NOTE: do NOT skipWaiting here — a fresh worker waits until the page's "Update" tap posts
  // skipWaiting, so a deploy can't reload the app out from under someone mid-shift.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(
    CORE.map(u => new Request(u, { cache: 'reload' }))
  )));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// the page posts this when the user taps "Update"; only then does a waiting worker take over
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // only handle our own origin. Cross-origin GETs (e.g. the Supabase sync API) pass straight
  // through untouched — never cached, never given the app-shell fallback.
  if (url.origin !== self.location.origin) return;
  // network-first, bypassing the browser HTTP cache so "fresh" is really fresh
  e.respondWith((async () => {
    // Cap the network wait. On degraded ramp wifi a request can connect but stall forever; without
    // this the promise never settles and the PWA hangs blank despite a perfectly good cached copy —
    // the exact failure offline-first exists to prevent. Abort at 4s and fall through to cache.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const res = await fetch(req, { cache: 'no-cache', signal: ctl.signal });
      clearTimeout(timer);
      // only cache genuine successes from our origin — never error pages (4xx/5xx) or opaque responses
      if (res && res.ok && res.type === 'basic') {
        caches.open(CACHE).then(c => c.put(req, res.clone())).catch(() => {});
      }
      return res;
    } catch (_) {
      clearTimeout(timer);
      const cached = await caches.match(req, { ignoreSearch: true });  // tolerate ?t= cache-busting
      if (cached) return cached;
      // fall back to the app shell only for page navigations — not for images, data, or API calls
      if (req.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
      return Response.error();
    }
  })());
});
