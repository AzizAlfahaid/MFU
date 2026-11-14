import { getSecret } from '../_deno/secrets.ts'
import { createNotifier } from './notifier.ts'
import { runTick } from './run.ts'
import { createStore } from './store.ts'

Deno.serve(async (req) => {
  const secret = await getSecret('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('unauthorized', { status: 401 })
  const notifier = createNotifier({
    vapidPublic: await getSecret('VAPID_PUBLIC_KEY'),
    vapidPrivate: await getSecret('VAPID_PRIVATE_KEY'),
    vapidSubject: await getSecret('VAPID_SUBJECT'),
    telegramToken: await getSecret('TELEGRAM_BOT_TOKEN'),
  })
  const result = await runTick(createStore(), notifier, new Date())
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
})
