import type { Household, Member, Profile } from './types'
import type { Lang } from '../i18n'
import { supabase } from './supabase'

export const PROFILE_COLUMNS = 'id, household_id, role, display_name, lang' // never select * on profiles
export const HOUSEHOLD_COLUMNS = 'id, name, timezone, missed_wait_minutes'

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const res = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle()
  return check(res) as Profile | null
}

export async function fetchHousehold(id: string): Promise<Household> {
  return check(await supabase.from('households').select(HOUSEHOLD_COLUMNS).eq('id', id).single()) as Household
}

export async function createHousehold(name: string, displayName: string): Promise<string> {
  return check(await supabase.rpc('create_household', { p_name: name, p_display_name: displayName })) as string
}

export async function listMembers(): Promise<Member[]> {
  return check(await supabase.rpc('household_members')) as Member[]
}

export interface NewMember { display_name: string; role: 'elder' | 'helper' | 'family'; username: string; password: string; lang: Lang }

export async function createMember(input: NewMember): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke('create-member', { body: input })
  if (error) {
    let code = 'failed'
    try { code = (await (error as { context?: Response }).context?.json())?.error ?? code } catch { /* no body */ }
    throw new Error(code)
  }
  return data as { id: string }
}

export async function updateMyLang(lang: Lang): Promise<void> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return
  check(await supabase.from('profiles').update({ lang }).eq('id', data.user.id))
}
