/**
 * Offline support for the one case that matters: you opened your workout, then
 * walked into a basement gym with no signal.
 *
 * Strategy is network-first with a cache fallback for page navigations. Fresh
 * data wins whenever the network is there — a stale set of prescribed weights
 * is worse than a spinner — but anything you've already loaded stays readable
 * when it isn't.
 *
 * Deliberately *not* cached: POSTs. A logged session must reach the server to
 * count, and silently swallowing one into a queue that might never flush would
 * lose training data. Offline, the submit fails visibly.
 */

const CACHE = "iron-atlas-v1";

// Static assets worth having before they're needed.
const PRECACHE = ["/icon.svg", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GETs are safe to serve from a cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache the chat stream or auth — one is a live SSE response, the
  // other must always hit the server.
  if (url.pathname.startsWith("/api/chat") || url.pathname.startsWith("/account")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache complete, successful responses.
        if (response.ok && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        // A navigation with nothing cached gets an honest message rather than
        // the browser's dinosaur.
        if (request.mode === "navigate") {
          return new Response(
            `<!doctype html><meta charset="utf-8">
             <meta name="viewport" content="width=device-width,initial-scale=1">
             <title>Offline · Iron Atlas</title>
             <body style="background:#0b0d10;color:#e8ebef;font-family:system-ui;padding:2rem;line-height:1.5">
               <h1 style="font-size:1.25rem">You're offline</h1>
               <p style="color:#949dab">This page hasn't been loaded before, so there's nothing cached for it.
               Pages you've already opened still work.</p>
             </body>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          );
        }
        return Response.error();
      }),
  );
});
