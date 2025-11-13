const CACHE_NAME = "moodify-cache-v2"; // cambia numero a ogni update
const ASSETS = [
  "/", // per GitHub Pages funziona automaticamente
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/MoodFavicon.png",
  "/MoodFavicon.png"
];

// Installazione: cache dei file principali
self.addEventListener("install", (event) => {
  console.log("🔹 Installazione Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); // attiva subito la nuova versione
});

// Attivazione: rimuove vecchie cache
self.addEventListener("activate", (event) => {
  console.log("🔹 Attivazione nuova versione SW...");
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("🗑️ Cache eliminata:", key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim(); // controlla subito le pagine aperte
});

// Fetch: serve dalla cache, poi aggiorna in background
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return; // ignora le POST (Spotify API ecc.)

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Aggiorna la cache con la nuova risposta
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        })
        .catch(() => cachedResponse); // se offline, usa la cache

      return cachedResponse || fetchPromise;
    })
  );
});