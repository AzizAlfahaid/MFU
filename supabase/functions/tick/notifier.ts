import type { Notifier, PushSub } from './run.ts'

export interface NotifierConfig { vapidPublic?: string; vapidPrivate?: string; vapidSubject?: string; telegramToken?: string }

export function createNotifier(cfg: NotifierConfig): Notifier {
  const pub = cfg.vapidPublic
  const priv = cfg.vapidPrivate
  const token = cfg.telegramToken

  // Loaded on first use so a problem with the push library can never stop Telegram alerts.
  // deno-lint-ignore no-explicit-any
  let wp: any = null
  async function webpush() {
    if (!wp) {
      const mod = await import('npm:web-push')
      wp = (mod as { default?: unknown }).default ?? mod
      wp.setVapidDetails(cfg.vapidSubject ?? 'mailto:admin@example.com', pub, priv)
    }
    return wp
  }

  return {
    async push(sub: PushSub, payload) {
      if (!pub || !priv) return 'ok'
      try {
        await (await webpush()).sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 900, urgency: 'high' })
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
