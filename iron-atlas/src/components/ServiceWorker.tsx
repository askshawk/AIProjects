"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production only. In development it would
 * cache the dev server's assets and serve stale bundles across edits, which
 * looks exactly like a broken hot reload.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failing just means no offline support; nothing else breaks.
    });

    // `signOut` (src/app/account/page.tsx) redirects here with this marker
    // right after destroying the session. Tell the worker to drop its cache
    // so a shared device can't serve the previous person's /train or /history
    // offline — belt-and-braces alongside those routes never being cached in
    // the first place.
    const params = new URLSearchParams(window.location.search);
    if (params.get("signedOut") === "1") {
      navigator.serviceWorker.controller?.postMessage({ type: "CLEAR_CACHE" });
      params.delete("signedOut");
      const rest = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (rest ? `?${rest}` : ""),
      );
    }
  }, []);

  return null;
}
