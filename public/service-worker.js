/* Kit do Técnico — service worker
 * - Arquivos do site: tenta a rede; sem internet, usa a cópia salva.
 * - Página: tenta a rede; sem internet, usa a cópia salva.
 * - /api/itens e /api/categorias: tenta a rede; sem internet, devolve a última resposta salva
 *   com o cabeçalho X-Kit-Offline: 1 (o app entra em modo somente leitura).
 * - Gravações (POST, PUT, PATCH, DELETE) nunca passam pelo cache.
 * IMPORTANTE: ao alterar index.html, CSS ou JS, aumente a VERSAO abaixo.
 */
const VERSAO = 'kit-estaticos-v12';
const CACHE_API = 'kit-api-v1';
const ESTATICOS = [
  '/',
  '/css/app.css',
  '/js/app.js',
  '/js/tema.js',
  '/fonts/inter-latin-wght-normal.woff2',
  '/fonts/space-grotesk-latin-wght-normal.woff2',
  '/fonts/jetbrains-mono-latin-wght-normal.woff2',
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];
const API_OFFLINE = ['/api/itens', '/api/categorias'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(VERSAO)
      .then((cache) => cache.addAll(ESTATICOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((n) => n !== VERSAO && n !== CACHE_API).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET') return;

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (API_OFFLINE.includes(url.pathname)) evento.respondWith(apiComReserva(pedido, url.pathname));
    return; // outras rotas da API (ex.: backup) vão direto para a rede
  }

  if (pedido.mode === 'navigate') {
    evento.respondWith(pagina(pedido));
    return;
  }

  evento.respondWith(estatico(pedido));
});

function guardavel(resposta) {
  return resposta && resposta.ok && resposta.type === 'basic' && !resposta.redirected;
}

async function apiComReserva(pedido, chave) {
  const cache = await caches.open(CACHE_API);
  try {
    const resposta = await fetch(pedido);
    const tipo = resposta.headers.get('Content-Type') || '';
    if (guardavel(resposta) && tipo.includes('application/json')) {
      await cache.put(chave, resposta.clone());
    }
    return resposta;
  } catch {
    const salva = await cache.match(chave);
    if (!salva) return Response.error();
    const cabecalhos = new Headers(salva.headers);
    cabecalhos.set('X-Kit-Offline', '1');
    return new Response(await salva.blob(), { status: 200, headers: cabecalhos });
  }
}

async function pagina(pedido) {
  try {
    const resposta = await fetch(pedido);
    if (guardavel(resposta)) {
      const cache = await caches.open(VERSAO);
      await cache.put('/', resposta.clone());
    }
    return resposta;
  } catch {
    const salva = await caches.match('/', { cacheName: VERSAO });
    return salva || Response.error();
  }
}

async function estatico(pedido) {
  // Rede primeiro: depois de um deploy, a versão nova aparece no primeiro acesso.
  // Sem internet, usa a cópia salva.
  const cache = await caches.open(VERSAO);
  try {
    const resposta = await fetch(pedido);
    if (guardavel(resposta)) await cache.put(pedido, resposta.clone());
    return resposta;
  } catch {
    const salvo = await cache.match(pedido, { ignoreSearch: true });
    return salvo || Response.error();
  }
}
