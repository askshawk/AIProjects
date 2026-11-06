"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production only. In development it would
 * cache dev-server bundles and make hot reload look broken.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No offline support, but nothing else breaks.
    });
  }, []);
  return null;
}
