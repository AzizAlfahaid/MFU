// Reads the number(s) shown on a home meter from a photo. Never advises, never saves anything:
// the app shows the result and the person confirms before it is stored.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { encodeBase64 } from 'jsr:@std/encoding/base64'
import { toMeterResult } from './parse.ts'
import type { ReadingType } from '../_shared/types.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SYSTEM = `You read numbers from photos of home medical devices. Report only the digits clearly shown on the device's display.
Do not interpret, advise or comment. If the display is missing, blurry, cut off or ambiguous, set readable to false.
Set confident to true only when every digit is sharp and unambiguous.`

const WHAT: Record<ReadingType, string> = {
  sugar: 'This is a blood glucose meter. Put the glucose number in value1 (mg/dL). If the display shows mmol/L (a small decimal such as 5.6), set readable to false.',
  bp: 'This is a blood pressure monitor. Put the upper number (SYS) in value1, the lower number (DIA) in value2, and the pulse in pulse if shown.',
  temp: 'This is a thermometer. Put the temperature in value1 in degrees Celsius. If it shows Fahrenheit, set readable to false.',
}

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] }
const SCHEMA = {
  type: 'object',
  properties: {
    readable: { type: 'boolean' },
    value1: nullableNumber,
    value2: nullableNumber,
    pulse: nullableNumber,
    confident: { type: 'boolean' },
  },
  required: ['readable', 'value1', 'value2', 'pulse', 'confident'],
  additionalProperties: false,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'not_configured' }, 503)

  const url = Deno.env.get('SUPABASE_URL')!
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return json({ error: 'forbidden' }, 403)
  const { data: me } = await admin.from('profiles').select('household_id').eq('id', userData.user.id).maybeSingle()
  if (!me) return json({ error: 'forbidden' }, 403)

  const body = await req.json().catch(() => null) as { photo_path?: unknown; type?: unknown } | null
  const type = body?.type
  const path = body?.photo_path
  if ((type !== 'sugar' && type !== 'bp' && type !== 'temp') || typeof path !== 'string') return json({ error: 'invalid_input' }, 400)
  if (!path.startsWith(`${me.household_id}/readings/`) || path.includes('..')) return json({ error: 'forbidden' }, 403)

  try {
    const { data: file, error } = await admin.storage.from('household-files').download(path)
    if (error || !file) return json({ error: 'read_failed' }, 502)
    const data = encodeBase64(new Uint8Array(await file.arrayBuffer()))
    const mediaType = ['image/png', 'image/webp', 'image/gif'].includes(file.type) ? file.type : 'image/jpeg'

    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({
      model: Deno.env.get('CLAUDE_MODEL') ?? 'claude-opus-5-5',
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: WHAT[type] },
        ],
      }],
    })
    if (res.stop_reason === 'refusal') return json({ readable: false })
    const text = res.content.find((b) => b.type === 'text')
    let parsed: unknown = null
    try { parsed = text && text.type === 'text' ? JSON.parse(text.text) : null } catch { /* unreadable */ }
    return json(toMeterResult(type, parsed))
  } catch (_e) {
    return json({ error: 'read_failed' }, 502)
  }
})
