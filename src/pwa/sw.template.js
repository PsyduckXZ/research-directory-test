"use strict";

const scope = new URL(self.registration.scope);
const cacheName = `research-directory:${scope.href}:@@REVISION@@`;
const files = new Map(Object.entries(@@FILES@@).map(([path, hash]) => [new URL(path, scope).href, hash]));
const indexUrl = new URL("index.html", scope).href;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const cache = await caches.open(cacheName);
      // Install completes only when every response matches this release.
      await Promise.allSettled([...files].map(async ([url, expectedHash]) => {
        try {
          const response = await fetch(url, { cache: "reload", signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
          const digest = await crypto.subtle.digest("SHA-256", await response.clone().arrayBuffer());
          const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
          if (hash !== expectedHash) throw new Error(`Версия файла не совпадает: ${url}`);
          await cache.put(url, response);
        } catch (error) {
          controller.abort();
          throw error;
        }
      })).then(results => {
        const failure = results.find(result => result.status === "rejected");
        if (failure) throw failure.reason;
      });
      if (@@MIGRATE@@) await self.skipWaiting();
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  })());
});

self.addEventListener("message", event => {
  if (event.data === "APPLY_UPDATE") event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  const cacheUrl = url.href === scope.href ? indexUrl : url.href;
  if (!files.has(cacheUrl)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(cacheUrl)) ?? new Response(null, { status: 503 });
  })());
});
