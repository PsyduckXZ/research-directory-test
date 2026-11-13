"use strict";

const scope = new URL(self.registration.scope);
const cacheName = `research-directory:${scope.href}:9148c991070266ac886eb80031bb2a9169bd457150cec8857a4ed22d88487318`;
const files = new Map(Object.entries({"index.html":"1e01475dea041f54608d2985e629caeb2a8ed874cc9cd7a6d9963c40a3794371","manifest.webmanifest":"286c37c3b324564a03e357afd08e57ea5824f4c37dd80d010bde73a7c433415b","icon-180.png":"179fcdb27a993c35c72896592c58ff34eeeb7fb6664545f0798a2a5c0b30b4f5","icon-192.png":"2425de01193c5532d59ceb18bbd17b8458daba91ac75d22b76862d7a671069c3","icon-512.png":"d96681c5eb1fbe7a68ab26c3277c8fdaeecda7fbe98a7fe58d36d9514e24ca6f","data/01.json":"d6b5c412e294bacdb705d86ac10a466a7d4321c2f1b01b9ac8e4a2c14b679031","data/02.json":"2b6df3ad9b7d250502727811c9b084a8415547e444ffccd009159129c451158b","data/03.json":"45d4f6ce9534f030ee391a5e3135e10a72ab31363acbd725591fed5b5796f6b9","data/04.json":"d3f9856a2bafb426c92aae183a96c7f9f3e5313292572b27d222d5825edaceea","data/05.json":"6da871d94137dc09978d77237be631073664b88039ecb42c3401083aa407278e","data/06.json":"09a69aea8845e263cae4e49be49c2c2847d37f001990f81e84570439eea3031e","data/07.json":"1a2bd4c745f2206c44356df9fe20ed462a74e03212081e0822f242b166b2ce9c","data/08.json":"7458a6920e8e3148a3de887d2c78c90328465296aef077035fa58004eb1e5248","data/09.json":"483f5bba6014f3e6cada0fa203655e8a1708c3f07fe5f8f5ed1612d5377ebe4e","data/water.json":"cd00319e7531c01e1f24dde57ed36d32e9d5a7d9469f5f25d6aacd94e311a8b1"}).map(([path, hash]) => [new URL(path, scope).href, hash]));
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
      if (false) await self.skipWaiting();
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
