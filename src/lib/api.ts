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

// ---------- medicines ----------
import type { Medication } from './types'

export type MedicationWithTimes = Medication & { times: string[] }
export interface MedicationInput {
  id?: string; name: string; dose: string; notes: string | null; photo_path: string | null; active: boolean; times: string[]
}

export async function listMedications(): Promise<MedicationWithTimes[]> {
  const rows = check(await supabase
    .from('medications')
    .select('id, household_id, name, dose, notes, photo_path, active, medication_times(time_of_day)')
    .order('name')) as (Medication & { medication_times: { time_of_day: string }[] })[]
  return rows.map(({ medication_times, ...m }) => ({
    ...m,
    times: medication_times.map((t) => t.time_of_day.slice(0, 5)).sort(),
  }))
}

export async function saveMedication(input: MedicationInput): Promise<void> {
  const fields = { name: input.name, dose: input.dose, notes: input.notes, photo_path: input.photo_path, active: input.active }
  let id = input.id
  if (id) check(await supabase.from('medications').update(fields).eq('id', id))
  else id = (check(await supabase.from('medications').insert(fields).select('id').single()) as { id: string }).id

  const wanted = [...new Set(input.times)].map((t) => `${t}:00`)
  const existing = check(await supabase.from('medication_times').select('id, time_of_day').eq('medication_id', id)) as { id: string; time_of_day: string }[]
  const stale = existing.filter((e) => !wanted.includes(e.time_of_day)).map((e) => e.id)
  if (stale.length) check(await supabase.from('medication_times').delete().in('id', stale))
  const have = new Set(existing.map((e) => e.time_of_day))
  const fresh = wanted.filter((t) => !have.has(t)).map((time_of_day) => ({ medication_id: id, time_of_day }))
  if (fresh.length) check(await supabase.from('medication_times').insert(fresh))
}

export async function setMedicationPhoto(id: string, path: string): Promise<void> {
  check(await supabase.from('medications').update({ photo_path: path }).eq('id', id))
}

export async function deleteMedication(id: string): Promise<void> {
  check(await supabase.from('medications').delete().eq('id', id))
}
