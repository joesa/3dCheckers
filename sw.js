/* Aether Draughts push worker.
   Only reacts to push + notification clicks — it never intercepts fetch, so it can
   never interfere with the game's networking or caching. Register it lazily (only
   when a player opts into reminders). A real reminder is sent by a trusted server
   that holds the VAPID private key and calls ad_push_due(); this worker just shows
   whatever payload that sender delivers. */

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'Aether Draughts';
  const options = {
    body: data.body || '',
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('url' in c && c.url.indexOf(url) !== -1 && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
