/* eslint-env serviceworker */
/* global clients */
self.addEventListener('push', event => {
  const data = event.data.json();
  const { title, body, icon, data: notificationData } = data.notification || {};

  const options = {
    body: body,
    icon: icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    data: {
      url: notificationData?.url || '/',
    },
  };

  event.waitUntil(
    self.registration.showNotification(title || 'New Notification', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    (async () => {
      if (typeof clients !== 'undefined') {
        const clientList = await clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });

        if (clientList.length > 0) {
          let client = clientList[0];
          for (let i = 0; i < clientList.length; i++) {
            if (clientList[i].focused) {
              client = clientList[i];
            }
          }
          if (client.focus) {
            await client.focus();
          }
          if (client.navigate) {
            return client.navigate(urlToOpen);
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      }
    })()
  );
});