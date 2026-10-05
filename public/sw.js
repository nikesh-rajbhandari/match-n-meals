// Admin PWA service worker (registered with scope /admin). Only handles push; no offline caching.

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || 'Match & Meals', {
    body: data.body,
    icon: '/icons/app-192.png',
    badge: '/icons/badge-96.png',
    tag: data.url, // a repeat push for the same slot replaces the old one
    data: { url: data.url || '/admin' },
  }));
});

// Tap: reuse an open admin window if there is one, otherwise open the app on that booking.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).pathname.startsWith('/admin'));
    if (win) { await win.navigate(url); return win.focus(); }
    return self.clients.openWindow(url);
  })());
});
