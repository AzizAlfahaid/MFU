// Telegram calls this when someone presses "Start" on the bot link: it links their chat to their account.
import { createClient } from 'npm:@supabase/supabase-js@2'

const TEXT = {
  ok: { ar: 'تم الربط. ستصلك التنبيهات هنا.', en: 'Connected. You will get alerts here.' },
  unknown: { ar: 'الرابط غير صالح. افتح الرابط من التطبيق مرة أخرى.', en: 'Link not recognised. Please open the link from the app again.' },
}

async function reply(chatId: number, text: string) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')
  if (!token) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => undefined)
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')
  if (!secret || req.headers.get('X-Telegram-Bot-Api-Secret-Token') !== secret) return new Response('unauthorized', { status: 401 })
  try {
    const update = await req.json()
    const text: string | undefined = update?.message?.text
    const chatId: number | undefined = update?.message?.chat?.id
    const m = text?.match(/^\/start\s+([0-9a-f]{24})$/)
    if (!m || typeof chatId !== 'number') return new Response('ok')

    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: profile } = await db.from('profiles').select('id, lang').eq('telegram_link_code', m[1]).maybeSingle()
    if (!profile) return await reply(chatId, `${TEXT.unknown.ar}\n${TEXT.unknown.en}`).then(() => new Response('ok'))
    await db.from('profiles').update({ telegram_chat_id: chatId }).eq('id', profile.id)
    await reply(chatId, TEXT.ok[profile.lang as 'ar' | 'en'] ?? TEXT.ok.en)
  } catch (_e) {
    /* always answer 200 so Telegram does not retry forever */
  }
  return new Response('ok')
})
