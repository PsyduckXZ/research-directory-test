"use strict";

const scope = new URL(self.registration.scope);
const cacheName = `research-directory:${scope.href}:@@REVISION@@`;
const files = @@FILES@@.map(path => new URL(path, scope).href);
const cachedUrls = new Set(files);
const indexUrl = new URL("index.html", scope).href;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(files.map(url => new Request(url, { cache: "reload" })));
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  url.search = "";
  const cacheUrl = url.href === scope.href ? indexUrl : url.href;
  if (!cachedUrls.has(cacheUrl)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    return (await cache.match(cacheUrl)) ?? fetch(event.request);
  })());
});
