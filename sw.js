// Offline support for Shortest Stop Route.
// The page itself is always fetched fresh when online (so updates show up right away),
// and the last copy is used when there's no signal. Map tiles you've seen are kept for offline use.
const CACHE = "ssr-app-v1";
const TILES = "ssr-tiles-v1";
const MAX_TILES = 1500;
const CORE = [
  "./", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png", "./icons/favicon-32.png",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE.map(url => cache.add(new Request(url, { cache: "reload" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE && key !== TILES) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) cache.put(req.mode === "navigate" ? "./" : req, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("./")) || Response.error();
  }
}

async function cacheFirst(req, name, limit) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") {
      await cache.put(req, res.clone());
      if (limit) {
        const keys = await cache.keys();
        for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
      }
    }
    return res;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith(".html");
    event.respondWith(isPage ? networkFirst(req) : cacheFirst(req, CACHE));
    return;
  }
  if (url.host === "unpkg.com" || url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req, CACHE));
    return;
  }
  if (url.host.endsWith("tile.openstreetmap.org")) {
    event.respondWith(cacheFirst(req, TILES, MAX_TILES));
  }
  // Address lookups and routing always go straight to the internet.
});
