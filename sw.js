// Full offline service worker — cache-first precaching.
// Bump CACHE_VERSION whenever any precached file changes, then do a hard
// reload (or DevTools "Update on reload") to pick up the new assets.
const CACHE_VERSION = "ironlog-cache-v1";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/db.js",
  "./js/seedData.js",
  "./js/auth.js",
  "./js/routines.js",
  "./js/schedule.js",
  "./js/settings.js",
  "./js/workout.js",
  "./js/reports.js",
  "./vendor/idb.js",
  "./vendor/chart.umd.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).catch(() => cached);
    })
  );
});
