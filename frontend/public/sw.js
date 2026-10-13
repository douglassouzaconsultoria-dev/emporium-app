// Service worker mínimo: deixa o Chrome oferecer "Instalar app".
// Não guarda nada em cache: o app sempre busca a versão mais nova do site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
