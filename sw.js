// Service worker de Copas Noventeros FC Gamers.
//
// Solo cachea los archivos propios de la web (el "cascarón"). Las peticiones a
// Firestore y a las fuentes de Google NO se tocan: van siempre a la red, porque los
// datos del torneo tienen que llegar en vivo.
//
// Al cambiar archivos, sube VERSION: al activarse borra las cachés anteriores, así
// nadie se queda con una versión vieja pegada.
const VERSION = 'copas-v7';

const ARCHIVOS = [
  './', './index.html', './style.css', './app.js', './firebase-config.js',
  './manifest.webmanifest',
  './assets/bg-neon.jpeg', './assets/logo.png',
  './assets/icono-192.png', './assets/icono-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return;  // Firestore y fuentes: a la red

  // Responde con lo cacheado (rápido y sirve sin conexión) y actualiza por detrás.
  e.respondWith(
    caches.match(req).then(cacheada => {
      const red = fetch(req).then(resp => {
        if (resp && resp.ok) caches.open(VERSION).then(c => c.put(req, resp.clone()));
        return resp;
      }).catch(() => cacheada);
      return cacheada || red;
    })
  );
});
