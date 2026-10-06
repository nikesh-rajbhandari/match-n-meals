// Admin PWA service worker (registered with scope /admin). Only handles push; no offline caching.

// Take over right away (also on updates), so open admin windows are controlled and can be navigated from a notification tap.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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

// Tap: bring the installed app forward on that booking.
// Order matters: focus() first, while the tap still counts as a user gesture (Android drops it after a slow await),
// then move the window. navigate() only works on windows this worker controls; otherwise ask the page to go itself.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).pathname.startsWith('/admin'));
    if (!win) return self.clients.openWindow(url); // app closed: opens in the installed app (url is inside its /admin scope)
    const focused = await win.focus().catch(() => win);
    try { await focused.navigate(url); } catch { focused.postMessage({ type: 'open', url }); }
  })());
});
