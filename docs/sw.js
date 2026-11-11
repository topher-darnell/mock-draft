// Big Head GM offline support.
// Online: always gets the newest files (and saves a copy).
// Offline: uses the saved copy, so the home-screen app still runs a full mock.
// Bump VERSION if you ever need every phone to throw away its saved copy.
const VERSION = "bhg-v18";

// the GM photos: same number as PHOTO_V in gm.js
const PHOTO_V = "1";
const GM_SHEETS = ["neutral", "focused", "happy", "sad", "trade"].map((m) => `gm/small-${m}.webp?v=${PHOTO_V}`);

const CORE = [
  "./",
  "index.html",
  "insights.html",
  "insights.js",
  "fantasy.html",
  "fantasy.js",
  "site.js",
  "newsletter.js",
  "home-pop.js",
  "games/",
  "games/prospectle.html",
  "games/prospectle.js",
  "games/fantasle.html",
  "games/fantasle.js",
  "games/17-0.html",
  "games/perfect.js",
  "games/blitz.html",
  "games/blitz.js",
  "games/juke.html",
  "games/juke.js",
  "style.css",
  "app.js",
  "gm.js",
  "manifest.json",
  "data/players.json",
  "data/teams.json",
  "data/draft_order.json",
  "data/trade_chart.json",
  "data/sims.json",
  "icons/mascot-head.png",
  "icons/logo-banner.webp",
  "icons/logo-banner-small.webp",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(CORE.map((u) => new Request(u, { cache: "reload" })))
        // the small GM sheets, so a whole draft works offline (not worth failing the install over)
        .then(() => cache.addAll(GM_SHEETS).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// fonts and GM photos never change (new photos get a new ?v=): use the saved copy first
async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") cache.put(request, response.clone());
  return response;
}

// the site's own files: newest from the network, saved copy when offline or slow
async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 4000)),
    ]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (e) {
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved) return saved;
    if (request.mode === "navigate") {
      const home = await cache.match("index.html");
      if (home) return home;
    }
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(request));
  } else if (url.origin === self.location.origin && url.pathname.includes("/gm/")) {
    event.respondWith(cacheFirst(request));
  } else if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
  }
});
