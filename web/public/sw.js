// Service Worker basique pour Site Ultime (PWA offline shell).
//
// Stratégie : network-first avec fallback cache pour les pages HTML,
// cache-first pour les assets statiques (JS/CSS/fonts/images). Les
// requêtes Supabase, PartyKit WS et /api/* sont toujours network-only
// (jamais cachées).

const CACHE_VERSION = "site-ultime-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Précachées au install pour avoir un fallback offline minimal.
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => !k.startsWith(CACHE_VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ne touche pas aux requêtes non-GET (POST RPC, etc.).
  if (request.method !== "GET") return;

  // Pas de cache pour les API ni Supabase ni PartyKit.
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("partykit") ||
    url.hostname.includes("partykit.io") ||
    url.protocol === "ws:" ||
    url.protocol === "wss:"
  ) {
    return;
  }

  // Network-first pour les pages HTML (toujours frais en ligne, fallback
  // au cache offline).
  if (request.mode === "navigate" || request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request).then((m) => m || caches.match("/"))),
    );
    return;
  }

  // Cache-first pour les assets statiques (JS, CSS, fonts, images).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        // Ne cache que les réponses OK et basiques (pas opaque CDN à 0
        // bytes qui crashent l'offline).
        if (resp.ok && (resp.type === "basic" || resp.type === "default")) {
          const copy = resp.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
        }
        return resp;
      });
    }),
  );
});
