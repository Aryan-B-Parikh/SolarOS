/**
 * SunPower Ops - Field PWA Service Worker
 * Phase 0 - Foundations
 * Spec: D8, PRD 1.7 (Field use: works on mid-range Android over 3G; offline drafts)
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `sunpower-shell-${CACHE_VERSION}`;
const DATA_CACHE = `sunpower-data-${CACHE_VERSION}`;

/** App shell resources to pre-cache at install time */
const SHELL_URLS = [
  '/',
  '/tech/today',
  '/tech/scan',
  '/offline',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: cache app shell ─────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for shell ─────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API calls: network-first, fall back to a queued-offline indicator
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          JSON.stringify({ error: 'OFFLINE', message: 'Request queued for retry' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // Navigation requests: serve shell, fall back to /offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match('/offline');
        })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});

// ── Background sync: replay queued offline requests ─────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sunpower-offline-queue') {
    event.waitUntil(replayOfflineQueue());
  }
});

async function replayOfflineQueue() {
  // Offline queue is managed by src/lib/offline-queue.ts (IndexedDB)
  // SW sends a message to all clients to trigger the replay
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach((client) => client.postMessage({ type: 'REPLAY_OFFLINE_QUEUE' }));
}
