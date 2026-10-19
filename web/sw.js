// Service Worker for Plan WN PWA
const CACHE_NAME = 'plan-umg-v3.11.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './js/state.js',
  './js/tenant-config.js',
  './js/schedule-engine.js',
  './js/timeline.js',
  './js/render.js',
  './js/modules/cross-reference.js',
  './js/modules/events.js',
  './js/modules/voting.js',
  './js/modules/lesson-hiding.js',
  './js/modules/changelog.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './maskable_icon_x512.png',
  './screenshot-desktop.png',
  './screenshot-mobile.png',
  './apple-touch-icon.png',
  './monochrome.svg',
  './planwn.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(STATIC_ASSETS);
      try {
        await cache.add('./data/tenant_config.json');
      } catch (_) {}
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Network-first strategy: always fetch latest version from server, fallback to cache offline
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});