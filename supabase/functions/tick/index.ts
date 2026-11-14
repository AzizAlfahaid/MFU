import { runTick } from './run.ts'
import { createStore } from './store.ts'
import { createNotifier } from './notifier.ts'

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('unauthorized', { status: 401 })
  const result = await runTick(createStore(), createNotifier(), new Date())
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
})
