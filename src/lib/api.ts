import type { Hospital, Household, Member, Profile } from './types'
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

// ---------- doses ----------
import type { DoseRow } from '@shared/types'

export type EnrichedDose = DoseRow & { dose: string; notes: string | null; photo_path: string | null }

export async function listDoses(fromIso: string, toIso: string): Promise<EnrichedDose[]> {
  const rows = check(await supabase
    .from('doses')
    .select('id, medication_id, scheduled_at, status, reminder_sent_at, missed_alert_sent_at, late_alert_sent_at, medications(name, dose, notes, photo_path)')
    .gte('scheduled_at', fromIso).lt('scheduled_at', toIso).order('scheduled_at')) as unknown as
    (Omit<DoseRow, 'name'> & { medications: { name: string; dose: string; notes: string | null; photo_path: string | null } })[]
  return rows.map(({ medications: m, ...d }) => ({ ...d, name: m.name, dose: m.dose, notes: m.notes, photo_path: m.photo_path }))
}

export async function markSlotTaken(slotIso: string): Promise<number> {
  return check(await supabase.rpc('mark_slot_taken', { p_slot: slotIso })) as number
}

/** Calls `onChange` whenever any dose changes; returns an unsubscribe function. */
export function subscribeDoses(onChange: () => void): () => void {
  const channel = supabase.channel(`doses-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'doses' }, onChange)
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

// ---------- readings and ranges ----------
import { isOutOfRange } from '@shared/ranges'
import type { Range, RangeKey, Reading, ReadingType, SugarContext } from './types'

const READING_COLUMNS = 'id, type, context, value1, value2, pulse, taken_at, entered_by, photo_path, source, out_of_range'

export async function listReadings(type: ReadingType, sinceIso: string): Promise<Reading[]> {
  return check(await supabase.from('readings').select(READING_COLUMNS).eq('type', type).gte('taken_at', sinceIso).order('taken_at', { ascending: false })) as Reading[]
}

export async function listRanges(): Promise<Range[]> {
  return check(await supabase.from('ranges').select('id, key, low, high')) as Range[]
}

export async function saveRange(key: RangeKey, low: number, high: number): Promise<void> {
  check(await supabase.from('ranges').upsert({ key, low, high }, { onConflict: 'household_id,key' }))
}

export interface NewReading {
  id?: string; type: ReadingType; context: SugarContext | null; value1: number
  value2?: number | null; pulse?: number | null; photo_path?: string | null; source: 'typed' | 'photo'
}

/** Saves a confirmed reading. Retrying with the same id is safe (a duplicate counts as saved). */
export async function addReading(input: NewReading): Promise<{ out_of_range: boolean }> {
  const out_of_range = isOutOfRange(input, await listRanges())
  const { data } = await supabase.auth.getUser()
  const { error } = await supabase.from('readings').insert({
    id: input.id, type: input.type, context: input.context, value1: input.value1, value2: input.value2 ?? null,
    pulse: input.pulse ?? null, photo_path: input.photo_path ?? null, source: input.source,
    out_of_range, entered_by: data.user?.id,
  })
  if (error && (error as { code?: string }).code !== '23505') throw new Error(error.message)
  return { out_of_range }
}

export async function deleteReading(id: string): Promise<void> {
  check(await supabase.from('readings').delete().eq('id', id))
}

export async function updateHousehold(patch: { missed_wait_minutes?: number; timezone?: string }): Promise<void> {
  const { data } = await supabase.auth.getUser()
  const p = check(await supabase.from('profiles').select('household_id').eq('id', data.user!.id).single()) as { household_id: string }
  check(await supabase.from('households').update(patch).eq('id', p.household_id))
}

// ---------- meter photo ----------
import type { MeterResult } from '@shared/types'

/** Asks Claude to read the meter in an uploaded photo. Any failure counts as "could not read". */
export async function readMeter(photoPath: string, type: ReadingType): Promise<MeterResult> {
  try {
    const { data, error } = await supabase.functions.invoke('read-meter', { body: { photo_path: photoPath, type } })
    if (error || !data || typeof data !== 'object' || (data as { readable?: unknown }).readable !== true) return { readable: false }
    return data as MeterResult
  } catch {
    return { readable: false }
  }
}

// ---------- appointments ----------
import type { Appointment } from './types'

export type AppointmentWithHospital = Appointment & { hospital: string | null }
export interface AppointmentInput {
  id?: string; starts_at: string; hospital_name: string; doctor: string; purpose: string; notes: string
}

export async function listHospitals(): Promise<Hospital[]> {
  return check(await supabase.from('hospitals').select('id, name').order('name')) as Hospital[]
}

export async function listAppointments(fromIso: string): Promise<AppointmentWithHospital[]> {
  const rows = check(await supabase
    .from('appointments')
    .select('id, starts_at, hospital_id, doctor, purpose, notes, hospitals(name)')
    .gte('starts_at', fromIso).order('starts_at')) as unknown as (Appointment & { hospitals: { name: string } | null })[]
  return rows.map(({ hospitals, ...a }) => ({ ...a, hospital: hospitals?.name ?? null }))
}

export async function saveAppointment(input: AppointmentInput): Promise<void> {
  let hospital_id: string | null = null
  const name = input.hospital_name.trim()
  if (name) {
    hospital_id = (check(await supabase.from('hospitals').upsert({ name }, { onConflict: 'household_id,name' }).select('id').single()) as { id: string }).id
  }
  const fields = {
    starts_at: input.starts_at, hospital_id, doctor: input.doctor.trim() || null,
    purpose: input.purpose.trim() || null, notes: input.notes.trim() || null,
  }
  if (input.id) check(await supabase.from('appointments').update(fields).eq('id', input.id))
  else check(await supabase.from('appointments').insert(fields))
}

export async function deleteAppointment(id: string): Promise<void> {
  check(await supabase.from('appointments').delete().eq('id', id))
}
