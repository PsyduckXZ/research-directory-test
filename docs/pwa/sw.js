"use strict";

const scope = new URL(self.registration.scope);
const cacheName = `research-directory:${scope.href}:c50e3fbd56006ab6802b0ba0487027cb79bba5290f17e1739a0f341e3c46b764`;
const files = ["index.html","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png","data/01.json","data/02.json","data/03.json","data/04.json","data/05.json","data/06.json","data/07.json","data/08.json","data/09.json","data/water.json"].map(path => new URL(path, scope).href);
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
