/*
 * Construction Ledger service worker.
 *
 * Deliberately minimal: pages contain private financial data, so nothing
 * from the app is cached. The only cached file is a static offline page,
 * shown when a page can't be loaded because the device is offline.
 *
 * Bump OFFLINE_CACHE when offline.html changes so clients refetch it.
 */
const OFFLINE_CACHE = "cl-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
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
            .filter((key) => key !== OFFLINE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Page navigations only: go to the network, fall back to the offline page.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((page) => page || Response.error()),
    ),
  );
});
