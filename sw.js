// SIGAP Service Worker — v2
//
// La versión anterior servía index.html con estrategia "cache first" y con un
// nombre de caché fijo ('sigap-v1') que nunca cambiaba. El resultado es que
// cualquier persona que hubiera abierto el SIGAP una sola vez seguía
// ejecutando para siempre la primera versión que descargó: ninguna corrección
// publicada después llegaba a su navegador. Por eso los borradores seguían
// duplicándose aunque el código ya estuviera arreglado.
//
// Ahora el documento y el código van por red primero, con la caché solo como
// respaldo cuando no hay conexión, y el nombre de la caché lleva versión para
// que cada despliegue limpie la anterior.

const VERSION       = 'v2-2026-10-28';
const CACHE_NAME    = 'sigap-' + VERSION;
const CACHE_OFFLINE = 'sigap-offline-v1';   // cola de pendientes: no se borra

// Solo lo que no cambia con cada despliegue
const RECURSOS_ESTATICOS = [
  './manifest.json',
  './logominerd.jpeg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ── INSTALACIÓN ───────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(RECURSOS_ESTATICOS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVACIÓN: fuera las cachés de versiones anteriores ─────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CACHE_OFFLINE)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── INTERCEPCIÓN ──────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Supabase nunca se cachea
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(
      fetch(req).catch(() => new Response(
        JSON.stringify({ error: 'Sin conexión', offline: true }),
        { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  const esDocumento = req.mode === 'navigate' ||
                      (req.destination === '' && url.pathname.endsWith('.html')) ||
                      url.pathname.endsWith('/') ||
                      url.pathname.endsWith('/index.html');

  if (esDocumento) {
    // Red primero: la aplicación siempre se abre con la versión publicada
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          if (res && res.ok) {
            const copia = res.clone();
            caches.open(CACHE_NAME).then(c => c.put('./index.html', copia));
          }
          return res;
        })
        .catch(() => caches.match('./index.html')
          .then(c => c || new Response('Sin conexión', { status: 503 })))
    );
    return;
  }

  // Lo demás: caché primero, pero refrescando en segundo plano
  event.respondWith(
    caches.match(req).then(cached => {
      const red = fetch(req).then(res => {
        if (res && res.ok) {
          const copia = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copia));
        }
        return res;
      }).catch(() => cached || new Response('Sin conexión', { status: 503 }));
      return cached || red;
    })
  );
});

// ── SINCRONIZACIÓN EN SEGUNDO PLANO ──────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-acompañamientos') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ tipo: 'SINCRONIZAR' }));
      })
    );
  }
});

// ── MENSAJES DESDE LA APP ─────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
