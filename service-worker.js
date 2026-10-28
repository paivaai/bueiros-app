/* service-worker.js — cache-first dos arquivos do app, para funcionar sem internet.
   IMPORTANTE: toda vez que você subir arquivos novos para o GitHub, aumente o número da VERSAO abaixo
   (v1 -> v2 -> v3...). É isso que faz os celulares perceberem a atualização. */
const VERSAO = 'v7';
const CACHE = 'bueiros-' + VERSAO;
const ARQUIVOS = [
  './', 'index.html', 'offline.html', 'manifest.webmanifest', 'css/styles.css',
  'js/vendor/supabase.js', 'js/vendor/leaflet/leaflet.js', 'js/vendor/leaflet/leaflet.css', 'js/vendor/leaflet/images/layers.png', 'js/vendor/leaflet/images/layers-2x.png', 'js/config.js', 'js/ui.js', 'js/codigo.js', 'js/db.js', 'js/gps.js', 'js/modelo.js', 'js/points.js', 'js/section-drawing.js', 'js/prancha.js', 'js/photos.js', 'js/patologias.js', 'js/bocas.js', 'js/formulario.js', 'js/export.js', 'js/kmz.js', 'js/conferencias.js', 'js/mapa.js', 'js/sync.js', 'js/app.js',
  'assets/logo-gfa.png', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-maskable-512.png',
];

/* Fundo do mapa: guarda os blocos que o usuário já viu (para rever sem internet). Cache separado, com limite; não baixa área em lote. */
const TILES = 'tiles-bueiros', MAX_TILES = 3000;
const TILE_HOSTS = ['server.arcgisonline.com', 'clarity.maptiles.arcgis.com', 'tile.openstreetmap.org'];
async function tile(req) {
  const cache = await caches.open(TILES), achou = await cache.match(req);
  if (achou) return achou;
  try {
    const r = await fetch(req);
    if (r && r.status === 200 && r.type !== 'opaque') {
      await cache.put(req, r.clone());
      cache.keys().then(ks => { if (ks.length > MAX_TILES) ks.slice(0, ks.length - MAX_TILES + 200).forEach(k => cache.delete(k)); });
    }
    return r;
  } catch (err) { return Response.error(); }
}

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
  if (TILE_HOSTS.includes(url.hostname)) { e.respondWith(tile(req)); return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/gestao/')) return; // painel de gestão: sempre da rede (online), fora do cache do app de campo
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
