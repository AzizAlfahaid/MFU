import type { ApptRow, DoseRow, MedTime } from '@shared/types'
import type { Notifier, Recipient, TickStore } from '../../supabase/functions/tick/run'

export const at = (local: string) => new Date(`${local}+03:00`) // Riyadh wall time -> instant
export const iso = (local: string) => at(local).toISOString()

interface FakeReading { id: string; type: 'sugar' | 'bp' | 'temp'; context: null; value1: number; value2: number | null; out_of_range: boolean; alert_sent_at: string | null }
interface FakeAppt extends ApptRow { household_id: string }

export class FakeStore implements TickStore {
  hh = [{ id: 'h1', timezone: 'Asia/Riyadh', missed_wait_minutes: 30 }]
  medTimes: Record<string, MedTime[]> = { h1: [] }
  all: (DoseRow & { household_id: string })[] = []
  readings: FakeReading[] = []
  appts: FakeAppt[] = []
  recips: Record<string, Recipient[]> = { h1: [] }
  removedSubs: string[] = []
  failMedTimesFor: string | null = null
  private n = 0

  doseList = (hid = 'h1') => this.all.filter((d) => d.household_id === hid)

  async households() { return this.hh.map((h) => ({ ...h })) }
  async activeMedTimes(hid: string) {
    if (this.failMedTimesFor === hid) throw new Error('db down')
    return this.medTimes[hid].map((m) => ({ ...m }))
  }
  async doses(hid: string, fromIso: string, toIso: string) {
    return this.all.filter((d) => d.household_id === hid && d.scheduled_at >= fromIso && d.scheduled_at < toIso).map((d) => ({ ...d }))
  }
  async insertDoses(hid: string, rows: { medication_id: string; scheduled_at: string }[]) {
    for (const r of rows) {
      if (this.all.some((d) => d.medication_id === r.medication_id && d.scheduled_at === r.scheduled_at)) continue
      const name = this.medTimes[hid].find((m) => m.medication_id === r.medication_id)?.name ?? r.medication_id
      this.all.push({ id: `d${++this.n}`, household_id: hid, medication_id: r.medication_id, name, scheduled_at: r.scheduled_at,
        status: 'pending', reminder_sent_at: null, missed_alert_sent_at: null, late_alert_sent_at: null })
    }
  }
  async deleteDoses(ids: string[]) { this.all = this.all.filter((d) => !ids.includes(d.id)) }
  async claimReminded(ids: string[]) {
    return this.all.filter((d) => ids.includes(d.id) && d.status === 'pending' && d.reminder_sent_at === null)
      .map((d) => { d.reminder_sent_at = 'claimed'; return d.id })
  }
  async claimMissed(ids: string[]) {
    return this.all.filter((d) => ids.includes(d.id) && (d.status === 'pending' || d.status === 'missed') && d.missed_alert_sent_at === null)
      .map((d) => { d.status = 'missed'; d.missed_alert_sent_at = 'claimed'; return d.id })
  }
  async unclaimMissed(ids: string[]) {
    for (const d of this.all) if (ids.includes(d.id) && d.status === 'missed') d.missed_alert_sent_at = null
  }
  async claimLateAlerted(ids: string[]) {
    return this.all.filter((d) => ids.includes(d.id) && d.late_alert_sent_at === null)
      .map((d) => { d.late_alert_sent_at = 'claimed'; return d.id })
  }
  async readingsToAlert() { return this.readings.filter((r) => r.out_of_range && r.alert_sent_at === null) }
  async claimReadingAlerted(ids: string[]) {
    return this.readings.filter((r) => ids.includes(r.id) && r.alert_sent_at === null).map((r) => { r.alert_sent_at = 'claimed'; return r.id })
  }
  async appointments(hid: string) { return this.appts.filter((a) => a.household_id === hid).map((a) => ({ ...a })) }
  async claimAppointment(id: string, which: 'day_before' | 'day_of') {
    const a = this.appts.find((x) => x.id === id)!
    const key = which === 'day_before' ? 'day_before_sent_at' : 'day_of_sent_at'
    if (a[key]) return false
    a[key] = 'claimed'
    return true
  }
  async recipients(hid: string) { return this.recips[hid] }
  async removePushSubscription(id: string) { this.removedSubs.push(id) }
}

export class FakeNotifier implements Notifier {
  pushes: { endpoint: string; title: string; body: string; tag: string }[] = []
  texts: { chatId: number; text: string }[] = []
  pushResult: Record<string, 'ok' | 'gone'> = {}
  failChat: number | null = null
  failChats = new Set<number>()
  chatFailuresLeft = new Map<number, number>()
  pushThrows = new Set<string>()
  attempts = 0
  async push(sub: { endpoint: string }, p: { title: string; body: string; tag: string }) {
    if (this.pushThrows.has(sub.endpoint)) throw new Error('push down')
    this.pushes.push({ endpoint: sub.endpoint, ...p })
    return this.pushResult[sub.endpoint] ?? 'ok'
  }
  async telegram(chatId: number, text: string) {
    this.attempts++
    if (chatId === this.failChat || this.failChats.has(chatId)) throw new Error('telegram down')
    const left = this.chatFailuresLeft.get(chatId) ?? 0
    if (left > 0) { this.chatFailuresLeft.set(chatId, left - 1); throw new Error('telegram blip') }
    this.texts.push({ chatId, text })
  }
  pushesTo = (endpoint: string) => this.pushes.filter((p) => p.endpoint === endpoint)
  textsTo = (chatId: number) => this.texts.filter((t) => t.chatId === chatId)
}

const sub = (id: string) => ({ id, endpoint: `https://push/${id}`, p256dh: 'k', auth: 'a' })
export function standardHousehold(store: FakeStore) {
  store.medTimes.h1 = [
    { medication_id: 'm1', name: 'Metformin', time_of_day: '08:00:00' },
    { medication_id: 'm2', name: 'Aspirin', time_of_day: '08:00:00' },
  ]
  store.recips.h1 = [
    { user_id: 'elder', role: 'elder', lang: 'ar', telegram_chat_id: null, push: [sub('elder')] },
    { user_id: 'helper', role: 'helper', lang: 'en', telegram_chat_id: null, push: [sub('helper')] },
    { user_id: 'fam1', role: 'family', lang: 'ar', telegram_chat_id: 111, push: [sub('fam1')] },
    { user_id: 'fam2', role: 'family', lang: 'en', telegram_chat_id: 222, push: [] },
    { user_id: 'fam3', role: 'family', lang: 'en', telegram_chat_id: null, push: [] },
  ]
}
