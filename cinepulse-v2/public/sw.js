/*
 * CinePulse service worker.
 *
 * Deliberately small and conservative:
 * - Pages always come from the network (they carry a per-request CSP nonce and your account
 *   state). Only when the network is unreachable does the offline page show instead.
 * - Hashed build files, fonts, icons and bundled artwork are cached after first use, so the
 *   installed app opens quickly.
 * - /api/* is never touched: account data, sessions and forecasts are never cached here.
 */
const VERSION = 'v3';
const SHELL = `cinepulse-shell-${VERSION}`;
const STATIC = `cinepulse-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png', '/icons/icon-512.png', '/icon.svg'];
const STATIC_LIMIT = 250;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cinepulse-') && k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/')
    || url.pathname.startsWith('/icons/')
    || url.pathname.startsWith('/assets/')
    || url.pathname === '/icon.svg';
}

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const hit = await caches.match(request); // either cache: precached shell files count too
  if (hit) return hit;
  const cache = await caches.open(STATIC);
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    cache.put(request, res.clone()).then(() => trim(STATIC, STATIC_LIMIT)).catch(() => {});
  }
  return res;
}

async function apiNavigation(event) {
  const preload = await event.preloadResponse.catch(() => undefined);
  return preload || fetch(event.request);
}

async function networkFirstPage(event) {
  try {
    const preload = await event.preloadResponse;
    if (preload) return preload;
    return await fetch(event.request);
  } catch {
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response('You are offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    // Never cached. But a navigation here (the Google sign-in callback) already has a preload
    // request in flight: answer with it, or the browser sends the request a second time and
    // one-time links (sign-in codes) fail on the repeat.
    if (request.mode === 'navigate') event.respondWith(apiNavigation(event));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(event));
    return;
  }
  if (isStaticAsset(url)) event.respondWith(cacheFirst(request));
});

self.addEventListener('activate', (event) => {
  if (self.registration.navigationPreload) event.waitUntil(self.registration.navigationPreload.enable().catch(() => {}));
});
