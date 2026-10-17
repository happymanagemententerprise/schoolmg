const VERSION = 'hma-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/hma.svg'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (new URL(request.url).pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(VERSION).then(cache => cache.put('/', copy));
      return response;
    }).catch(() => caches.match('/')));
    return;
  }
  if (['script', 'style', 'font', 'image'].includes(request.destination)) {
    event.respondWith(caches.open(VERSION).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request).then(response => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      return cached || network.catch(() => Response.error());
    }));
  }
});
self.addEventListener('sync', event => {
  if (event.tag !== 'hma-attendance-sync') return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    clients.forEach(client => client.postMessage({ type: 'SYNC_ATTENDANCE' }));
  }));
});
self.addEventListener('online', () => self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
  clients.forEach(client => client.postMessage({ type: 'SYNC_ATTENDANCE' }));
}));
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || 'Open the school app to view updates.' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'Happy Man Academy', {
    body: payload.body || 'You have a new school update.',
    icon: '/icons/hma.svg', badge: '/icons/hma.svg', data: { url: payload.url || '/' },
    tag: payload.tag || 'hma-school-notification', renotify: false
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => client.url.startsWith(self.location.origin));
    if (existing) { existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});
