// Service worker mínimo: deixa o Chrome oferecer "Instalar app".
// Não guarda nada em cache: o app sempre busca a versão mais nova do site.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// 🔔 Notificação de entrega para o motoboy (chega mesmo com o app fechado)
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
