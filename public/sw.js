self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { data = { title: 'Messme', body: event.data.text() } }

  const title = data.title ?? 'Messme'
  const options = {
    body: data.body ?? 'Новое сообщение',
    icon: '/apple-touch-icon',
    badge: '/apple-touch-icon',
    tag: data.chatId ?? 'messme',
    renotify: true,
    data: { url: data.url ?? '/' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      return clients.openWindow(url)
    })
  )
})
