/**
 * Offline support for reading: the glossary and term pages you've opened stay
 * available without signal (on a plane, in a dead zone).
 *
 * Network-first with a cache fallback, so fresh content always wins when
 * there's a connection. Study sessions are deliberately not cached: a rating
 * has to reach the server to count, and a stale queue would show cards that
 * were already reviewed. Offline, those pages fail visibly instead.
 */

const CACHE = "ai-fluency-v1";

self.addEventListener("install", () => self.skipWaiting());

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
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/" || url.pathname.startsWith("/study") || url.pathname.startsWith("/sign-in")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Only cache complete, successful responses (never a sign-in redirect).
        if (response.ok && response.status === 200 && !response.redirected) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          return new Response(
            `<!doctype html><meta charset="utf-8">
             <meta name="viewport" content="width=device-width,initial-scale=1">
             <title>Offline · AI Fluency</title>
             <body style="font-family:system-ui;padding:2rem;line-height:1.5">
               <h1 style="font-size:1.25rem">You're offline</h1>
               <p>This page hasn't been opened before, so it isn't saved. Glossary pages you've already opened still work.</p>
             </body>`,
            { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 503 },
          );
        }
        return Response.error();
      }),
  );
});
