// ============================================================
//  Happy Man Academy — Service Worker
//
//  Handles Web Push notifications. When a pre-class alert (or any
//  push from the server) arrives, this worker shows a browser
//  notification. Clicking it focuses the app tab or opens a new one.
// ============================================================

const CACHE_NAME = 'hma-v1';

// ── Install / activate ───────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// ── Push event ───────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data?.json() || {}; } catch { data = { title: 'Happy Man Academy', body: event.data?.text() || '' }; }

  const title   = data.title || 'Happy Man Academy';
  const options = {
    body:    data.body    || '',
    icon:    '/icon-192.png',
    badge:   '/badge-72.png',
    tag:     data.tag     || 'hma-alert',
    renotify: true,
    data:    { url: data.url || '/' },
    actions: data.actions || []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ───────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.startsWith(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
