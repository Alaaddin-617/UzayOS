/* Alan Kilit — çevrimdışı önbellek */
const CACHE = 'alan-kilit-v20';
const ASSETS = [
  './',
  './index.html',
  './assets/style.css',
  './assets/geofence.js',
  './assets/maps-places.js',
  './assets/release-notes.js',
  './assets/app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

const NETWORK_FIRST = /\.(?:html|js|css|webmanifest)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .catch(() => {})
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function agdanGetir(request) {
  return fetch(request).then((response) => {
    if (response && response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return response;
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const networkFirst = request.mode === 'navigate' || NETWORK_FIRST.test(path);

  if (networkFirst) {
    event.respondWith(
      agdanGetir(request).catch(() =>
        caches.match(request).then((cached) => cached || caches.match('./index.html'))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return agdanGetir(request).catch(() => caches.match('./index.html'));
    })
  );
});
