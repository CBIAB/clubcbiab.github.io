// Club del Árbitro CBiAB — Service Worker
const CACHE = 'clubarbitro-v7';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/data.js',
  '/data-oficiales.js',
  '/proteccion.js',
  '/logo.png',
  '/manifest.json'
];

// Instalar: guarda los archivos estáticos en caché
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activar: limpia cachés antiguas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first — siempre intenta la red, caché solo si falla (offline)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('cdn.jsdelivr')) return;

  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Actualizar caché con la respuesta fresca
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, copy));
        return response;
      })
      .catch(() => caches.match(e.request)) // Sin red → usar caché (offline)
  );
});
