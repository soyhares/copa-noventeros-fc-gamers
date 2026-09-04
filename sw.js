// Service worker de Noventeros FC.
//
// Solo cachea los archivos propios de la web (el "cascarón"). Las peticiones a
// Firestore y a las fuentes de Google NO se tocan: van siempre a la red, porque los
// datos del torneo tienen que llegar en vivo.
//
// Al cambiar archivos, sube VERSION: al activarse borra las cachés anteriores, así
// nadie se queda con una versión vieja pegada.
const VERSION = 'noventeros-v12';

const ARCHIVOS = [
  './', './index.html', './style.css', './app.js', './firebase-config.js',
  './manifest.webmanifest',
  './assets/bg-neon.jpeg', './assets/logo.png',
  './assets/favicon-32.png', './assets/favicon-16.png',
  './assets/apple-touch-icon.png',
  './assets/icon-192.png', './assets/icon-512.png', './assets/icon-maskable-512.png'
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

// El código va siempre a la red primero. Esto importa más de lo que parece: la app
// no tiene build ni hashes en los nombres de archivo, así que app.js y style.css
// conservan su URL para siempre. Con la estrategia anterior (cachear primero y
// refrescar por detrás) cada despliegue llegaba una recarga tarde -- el usuario veía
// el código de su visita anterior. La caché queda solo como respaldo sin conexión.
function redPrimero(req) {
  return fetch(req)
    .then(resp => {
      if (resp && resp.ok) {
        const copia = resp.clone();
        caches.open(VERSION).then(c => c.put(req, copia));
      }
      return resp;
    })
    .catch(() => caches.match(req).then(c => c || caches.match('./index.html')));
}

// Las imágenes sí van desde la caché: no cambian sin cambiar de nombre, y las
// genera tools/iconos.sh, así que un cambio de arte trae nombres o VERSION nuevos.
function cachePrimero(req) {
  return caches.match(req).then(cacheada => cacheada || fetch(req).then(resp => {
    if (resp && resp.ok) {
      const copia = resp.clone();
      caches.open(VERSION).then(c => c.put(req, copia));
    }
    return resp;
  }));
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;  // Firestore y fuentes: a la red

  const esCodigo = req.mode === 'navigate' || /\.(js|css|webmanifest)$/.test(url.pathname);
  e.respondWith(esCodigo ? redPrimero(req) : cachePrimero(req));
});
