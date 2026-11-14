// Supabase-backed TickStore (service role). Every "claim" is a single conditional UPDATE ... RETURNING,
// so two overlapping runs can never both send the same notification.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { AlertReading, Recipient, TickStore } from './run.ts'
import type { ApptRow, DoseRow, MedTime } from '../_shared/types.ts'

export function createStore(): TickStore {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const ok = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message)
    return r.data as T
  }
  const nowIso = () => new Date().toISOString()
  const ids = (rows: { id: string }[] | null) => (rows ?? []).map((r) => r.id)

  return {
    async households() {
      return ok(await db.from('households').select('id, timezone, missed_wait_minutes'))
    },
    async activeMedTimes(hid) {
      const rows = ok(await db.from('medication_times').select('medication_id, time_of_day, medications!inner(name, active)')
        .eq('household_id', hid).eq('medications.active', true)) as unknown as { medication_id: string; time_of_day: string; medications: { name: string } }[]
      return rows.map((r): MedTime => ({ medication_id: r.medication_id, name: r.medications.name, time_of_day: r.time_of_day }))
    },
    async doses(hid, fromIso, toIso) {
      const rows = ok(await db.from('doses')
        .select('id, medication_id, scheduled_at, status, reminder_sent_at, missed_alert_sent_at, late_alert_sent_at, medications(name)')
        .eq('household_id', hid).gte('scheduled_at', fromIso).lt('scheduled_at', toIso)) as unknown as (Omit<DoseRow, 'name'> & { medications: { name: string } })[]
      return rows.map(({ medications, ...d }): DoseRow => ({ ...d, name: medications.name }))
    },
    async insertDoses(hid, rows) {
      ok(await db.from('doses').upsert(rows.map((r) => ({ ...r, household_id: hid })), { onConflict: 'medication_id,scheduled_at', ignoreDuplicates: true }))
    },
    async deleteDoses(list) {
      ok(await db.from('doses').delete().in('id', list).eq('status', 'pending'))
    },
    async claimReminded(list) {
      return ids(ok(await db.from('doses').update({ reminder_sent_at: nowIso() }).in('id', list).eq('status', 'pending').is('reminder_sent_at', null).select('id')))
    },
    async claimMissed(list) {
      return ids(ok(await db.from('doses').update({ status: 'missed', missed_alert_sent_at: nowIso() }).in('id', list).in('status', ['pending', 'missed']).is('missed_alert_sent_at', null).select('id')))
    },
    async unclaimMissed(list) {
      ok(await db.from('doses').update({ missed_alert_sent_at: null }).in('id', list).eq('status', 'missed'))
    },
    async claimLateAlerted(list) {
      return ids(ok(await db.from('doses').update({ late_alert_sent_at: nowIso() }).in('id', list).is('late_alert_sent_at', null).select('id')))
    },
    async readingsToAlert(hid) {
      const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
      return ok(await db.from('readings').select('id, type, context, value1, value2')
        .eq('household_id', hid).eq('out_of_range', true).is('alert_sent_at', null).gte('created_at', since)) as AlertReading[]
    },
    async claimReadingAlerted(list) {
      return ids(ok(await db.from('readings').update({ alert_sent_at: nowIso() }).in('id', list).is('alert_sent_at', null).select('id')))
    },
    async appointments(hid, fromIso, toIso) {
      const rows = ok(await db.from('appointments')
        .select('id, starts_at, doctor, purpose, day_before_sent_at, day_of_sent_at, hospitals(name)')
        .eq('household_id', hid).gte('starts_at', fromIso).lt('starts_at', toIso)) as unknown as (Omit<ApptRow, 'hospital'> & { hospitals: { name: string } | null })[]
      return rows.map(({ hospitals, ...a }): ApptRow => ({ ...a, hospital: hospitals?.name ?? null }))
    },
    async claimAppointment(id, which) {
      const col = which === 'day_before' ? 'day_before_sent_at' : 'day_of_sent_at'
      return ids(ok(await db.from('appointments').update({ [col]: nowIso() }).eq('id', id).is(col, null).select('id'))).length > 0
    },
    async recipients(hid) {
      const rows = ok(await db.from('profiles')
        .select('id, role, lang, telegram_chat_id, push_subscriptions(id, endpoint, p256dh, auth)')
        .eq('household_id', hid)) as unknown as { id: string; role: Recipient['role']; lang: Recipient['lang']; telegram_chat_id: number | null; push_subscriptions: Recipient['push'] }[]
      return rows.map((r): Recipient => ({ user_id: r.id, role: r.role, lang: r.lang, telegram_chat_id: r.telegram_chat_id, push: r.push_subscriptions }))
    },
    async removePushSubscription(id) {
      ok(await db.from('push_subscriptions').delete().eq('id', id))
    },
  }
}
