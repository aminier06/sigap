// SIGAP Service Worker — v1.0
const CACHE_NAME    = 'sigap-v1';
const CACHE_OFFLINE = 'sigap-offline-v1';

// Recursos que se cachean al instalar (shell de la app)
const RECURSOS_ESTATICOS = [
  './',
  './index.html',
  './manifest.json',
  './logominerd.jpeg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ── INSTALACIÓN ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(RECURSOS_ESTATICOS).catch(err => {
        console.warn('SIGAP SW: Error cacheando recursos estáticos', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVACIÓN ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CACHE_OFFLINE)
            .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── INTERCEPCIÓN DE REQUESTS ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // No interceptar requests a Supabase API — esas las maneja el app con IndexedDB
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Si falla la conexión a Supabase, devolver respuesta offline
        return new Response(
          JSON.stringify({ error: 'Sin conexión', offline: true }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Para recursos estáticos: Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cachear respuestas exitosas de recursos estáticos
        if (response.ok && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Si es navegación y no hay red, devolver el index cacheado
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Sin conexión', { status: 503 });
      });
    })
  );
});

// ── SINCRONIZACIÓN EN SEGUNDO PLANO ──────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-acompañamientos') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ tipo: 'SINCRONIZAR' });
        });
      })
    );
  }
});

// ── MENSAJES DESDE LA APP ─────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
