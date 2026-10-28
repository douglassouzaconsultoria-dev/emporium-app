// Service worker: deixa o Chrome oferecer "Instalar app" e faz o app abrir mesmo sem internet.
// Com internet, sempre busca a versão mais nova (do site e dos produtos); sem internet, usa a última que guardou.
const APP_CACHE = 'emporio-app-v1';   // páginas e arquivos do site
const DATA_CACHE = 'emporio-dados-v1'; // produtos, categorias, loja e banners (só leitura, públicos)
const KEEP_FILES = 60;                 // arquivos do site guardados (os mais recentes)
const SLOW_MS = 5000;                  // internet muito lenta: depois disso usa o que tem guardado

// Só dados públicos da loja (sem login): nada pessoal fica guardado aqui
const PUBLIC_DATA = [/\/api\/products$/, /\/api\/categories$/, /\/api\/settings\/store$/, /\/api\/settings\/banners$/];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => ![APP_CACHE, DATA_CACHE].includes(k)).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

// Guarda sem deixar a pasta crescer para sempre (cada atualização do site cria arquivos novos)
const put = async (cacheName, request, response, limit) => {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  if (!limit) return;
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map(k => cache.delete(k)));
};

// Internet primeiro; se falhar (ou demorar demais e já tiver cópia), usa a cópia guardada
const networkFirst = (event, cacheName, cacheKey, limit) => {
  const fresh = fetch(event.request);
  event.waitUntil(fresh
    .then(response => (response.ok ? put(cacheName, cacheKey, response.clone(), limit) : null))
    .catch(() => {}));
  event.respondWith((async () => {
    const saved = await caches.match(cacheKey, { cacheName });
    if (!saved) return fresh;
    const slow = new Promise(resolve => setTimeout(() => resolve(saved), SLOW_MS));
    return Promise.race([fresh.catch(() => saved), slow]);
  })());
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // pedidos, login etc. sempre direto no servidor
  const url = new URL(request.url);

  // Páginas do app: todas abrem o mesmo index.html
  if (request.mode === 'navigate' && url.origin === self.location.origin && !url.pathname.endsWith('.html')) {
    networkFirst(event, APP_CACHE, '/index.html');
    return;
  }
  // Arquivos do próprio site (js, css, ícones, logo)
  if (url.origin === self.location.origin && /\.(js|css|png|svg|ico|json|webmanifest)$/.test(url.pathname)) {
    networkFirst(event, APP_CACHE, request, KEEP_FILES);
    return;
  }
  // Dados públicos da loja (o servidor da API fica em outro endereço)
  if (PUBLIC_DATA.some(re => re.test(url.pathname)) && !request.headers.get('Authorization')) {
    networkFirst(event, DATA_CACHE, url.origin + url.pathname);
  }
  // O resto (pedidos, perfil, admin, fotos do Cloudinary) segue normal pela internet
});

// 🔔 Notificação (motoboy: entrega nova · admin: pedido novo · cliente: situação do pedido)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { body: event.data && event.data.text() };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Empório Brumado', {
    body: data.body || 'Você tem uma atualização de entrega.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag,
    renotify: Boolean(data.tag),
    requireInteraction: true,
    vibrate: [400, 150, 400, 150, 400],
    data: { url: data.url || '/' }
  }));
});

// Toque na notificação: abre (ou traz para frente) o app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find(w => 'focus' in w);
      const url = event.notification.data.url || '/';
      if (!open) return self.clients.openWindow(url);
      open.postMessage({ url }); // ex: aviso do pedido → o app abre "Meus Pedidos"
      return open.focus();
    })
  );
});
