"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (offline fallback page) in production builds. Skipped in
 * development, where a service worker would get in the way of hot reload.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // Not fatal: the app works the same without the offline page.
      });
  }, []);
  return null;
}
