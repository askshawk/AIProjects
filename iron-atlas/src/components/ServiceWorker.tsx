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
  }, []);

  return null;
}
