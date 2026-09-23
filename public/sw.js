// Minimal service worker: mostly here to satisfy PWA installability
// criteria (Chrome/Android requires an active SW with a fetch handler) and
// to give the app an offline-friendly shell. This app is inherently
// online-first (files live in R2, data in Supabase), so we don't attempt to
// cache API/data responses — just the static app shell.
const CACHE = "minha-nuvem-shell-v1";
const SHELL_URLS = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept API calls or cross-origin requests (R2/Supabase) — those
  // must always hit the network fresh.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
