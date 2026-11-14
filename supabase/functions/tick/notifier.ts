import webpush from 'npm:web-push'
import type { Notifier, PushSub } from './run.ts'

export function createNotifier(): Notifier {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (pub && priv) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', pub, priv)

  return {
    async push(sub: PushSub, payload) {
      if (!pub || !priv) return 'ok'
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600 })
        return 'ok'
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) return 'gone'
        throw e
      }
    },
    async telegram(chatId, text) {
      if (!token) return
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      })
      if (!res.ok) throw new Error(`telegram ${res.status}`)
    },
  }
}
