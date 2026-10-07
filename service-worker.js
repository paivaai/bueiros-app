/* service-worker.js — cache-first dos arquivos do app, para funcionar sem internet.
   IMPORTANTE: toda vez que você subir arquivos novos para o GitHub, aumente o número da VERSAO abaixo
   (v1 -> v2 -> v3...). É isso que faz os celulares perceberem a atualização. */
const VERSAO = 'v1';
const CACHE = 'bueiros-' + VERSAO;
const ARQUIVOS = [
  './', 'index.html', 'offline.html', 'manifest.webmanifest', 'css/styles.css',
  'js/ui.js', 'js/db.js', 'js/gps.js', 'js/points.js', 'js/section-drawing.js', 'js/photos.js', 'js/export.js', 'js/app.js',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  // Não chama skipWaiting sozinho: o app mostra "Nova versão disponível" e o usuário decide quando atualizar.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('bueiros-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data && e.data.tipo === 'PULAR_ESPERA') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const achou = await cache.match(req, { ignoreSearch: true });
    if (achou) return achou;
    try {
      const r = await fetch(req);
      if (r && r.ok) cache.put(req, r.clone());
      return r;
    } catch (err) {
      if (req.mode === 'navigate') return (await cache.match('index.html')) || (await cache.match('offline.html'));
      throw err;
    }
  })());
});
