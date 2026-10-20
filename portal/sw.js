// portal/sw.js — Skrypt czyszczący stary Service Worker z poziomu katalogu głównego
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('plan-app-') || key.includes('v3.11.0')) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      return self.registration.unregister();
    }).then(() => {
      return self.clients.claim();
    }).then(() => {
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          if (client.url && !client.url.includes('/umg/') && !client.url.includes('/sggw/')) {
            client.navigate(client.url);
          }
        });
      });
    })
  );
});
