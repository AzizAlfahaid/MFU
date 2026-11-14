/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; tag?: string } = {}
  try { data = event.data?.json() ?? {} } catch { data = { body: event.data?.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'المتابعة الطبية', {
      body: data.body, tag: data.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
      renotify: true, requireInteraction: true,
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) if ('focus' in w) return void (await w.focus())
    await self.clients.openWindow('/')
  })())
})
