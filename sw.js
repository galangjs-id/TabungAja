// Naikkan angka ini kalau mau paksa semua perangkat bikin cache baru.
// Kode (index/app.js/style.css) tetap selalu diambil dari network dulu,
// jadi update biasanya kepakai tanpa perlu ganti angka ini.
const VERSION = 'v21';
const CACHE_NAME = 'tabungaja-cache-' + VERSION;
const RUNTIME_CACHE = 'tabungaja-runtime-' + VERSION;
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache:'reload' = lewati cache HTTP browser, selalu ambil file terbaru
      Promise.all(ASSETS_TO_CACHE.map((u) => cache.add(new Request(u, { cache: 'reload' }))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('tabungaja-') && k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

const cacheable = (res) => res && (res.ok || res.type === 'opaque');
function put(cacheName, req, res){
  if (!cacheable(res)) return Promise.resolve();
  return caches.open(cacheName).then((c) => c.put(req, res));
}

// Network-first: coba ambil terbaru, kalau offline baru pakai cache.
function networkFirst(event, cacheName, fallbackUrl){
  return fetch(event.request)
    .then((res) => {
      event.waitUntil(put(cacheName, event.request, res.clone()));
      return res;
    })
    .catch(() => caches.match(event.request, { ignoreSearch: true })
      .then((hit) => hit || (fallbackUrl ? caches.match(fallbackUrl) : undefined)));
}

// Stale-while-revalidate: tampil dari cache, diam-diam update di belakang.
function staleWhileRevalidate(event, cacheName){
  return caches.open(cacheName).then((cache) =>
    cache.match(event.request).then((cached) => {
      const net = fetch(event.request)
        .then((res) => { event.waitUntil(put(cacheName, event.request, res.clone())); return res; })
        .catch(() => cached);
      return cached || net;
    })
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // POST/PUT dll: biarkan lewat

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && (url.pathname.startsWith('/api/') || url.pathname.endsWith('/msg.json'))) {
    // API & pesan info dari server: jangan pernah di-cache
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req)));
    return;
  }

  if (!sameOrigin) {
    // font & ikon dari CDN: biar tetap tampil saat offline
    event.respondWith(staleWhileRevalidate(event, RUNTIME_CACHE));
    return;
  }

  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(networkFirst(event, CACHE_NAME, './index.html'));
    return;
  }

  if (/\.(?:js|css|json)$/.test(url.pathname)) {
    // kode app & manifest: network-first supaya update langsung kepakai
    event.respondWith(networkFirst(event, CACHE_NAME));
    return;
  }

  // icon/gambar: cache-first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      event.waitUntil(put(CACHE_NAME, req, res.clone()));
      return res;
    }))
  );
});
