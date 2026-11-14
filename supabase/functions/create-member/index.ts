// Family-only: creates a login (elder / helper / family) inside the caller's household.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { toEmail, validateMemberInput } from '../_shared/login.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const authHeader = req.headers.get('Authorization') ?? ''
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return json({ error: 'forbidden' }, 403)
  const { data: me } = await admin.from('profiles').select('role, household_id').eq('id', userData.user.id).maybeSingle()
  if (!me || me.role !== 'family') return json({ error: 'forbidden' }, 403)

  const parsed = validateMemberInput(await req.json().catch(() => null))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const m = parsed.value

  const { data: created, error } = await admin.auth.admin.createUser({
    email: toEmail(m.username), password: m.password, email_confirm: true,
  })
  if (error || !created.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? '')
    return json({ error: taken ? 'username_taken' : 'create_failed' }, taken ? 409 : 500)
  }
  const { error: pErr } = await admin.from('profiles').insert({
    id: created.user.id, household_id: me.household_id, role: m.role, display_name: m.display_name, lang: m.lang,
  })
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id)
    return json({ error: 'create_failed' }, 500)
  }
  return json({ id: created.user.id })
})
