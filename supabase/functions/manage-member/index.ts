// Family-only: remove a member, set a new password for them, or change their language.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { validateManageInput } from '../_shared/login.ts'

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
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return json({ error: 'forbidden' }, 403)
  const { data: me } = await admin.from('profiles').select('role, household_id').eq('id', userData.user.id).maybeSingle()
  if (!me || me.role !== 'family') return json({ error: 'forbidden' }, 403)

  const parsed = validateManageInput(await req.json().catch(() => null))
  if (!parsed.ok) return json({ error: parsed.error }, 400)
  const m = parsed.value

  const { data: target } = await admin.from('profiles').select('id, role, household_id').eq('id', m.id).maybeSingle()
  if (!target || target.household_id !== me.household_id) return json({ error: 'not_found' }, 404)

  if (m.action === 'remove') {
    if (target.id === userData.user.id) return json({ error: 'cannot_remove_self' }, 400)
    if (target.role === 'family') {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true })
        .eq('household_id', me.household_id).eq('role', 'family')
      if ((count ?? 0) <= 1) return json({ error: 'last_family' }, 400)
    }
    const { error } = await admin.auth.admin.deleteUser(m.id)
    return error ? json({ error: 'failed' }, 500) : json({ ok: true })
  }
  if (m.action === 'reset_password') {
    const { error } = await admin.auth.admin.updateUserById(m.id, { password: m.password })
    return error ? json({ error: 'failed' }, 500) : json({ ok: true })
  }
  const { error } = await admin.from('profiles').update({ lang: m.lang }).eq('id', m.id)
  return error ? json({ error: 'failed' }, 500) : json({ ok: true })
})
