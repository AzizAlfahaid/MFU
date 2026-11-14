// The every-minute job. Pure orchestration: all I/O goes through `TickStore` and `Notifier`.
import { appTitle, appointmentText, doseReminderText, lateTakenText, missedDoseText, readingAlertText } from '../_shared/messages.ts'
import { classifyDoses, dueAppointmentReminders, planDoses } from '../_shared/schedule.ts'
import { addDays, formatTime, localDate, minutes, zonedToUtc } from '../_shared/time.ts'
import type { ApptRow, DoseRow, Lang, MedTime, ReadingType, Role, SugarContext } from '../_shared/types.ts'

export interface PushSub { id: string; endpoint: string; p256dh: string; auth: string }
export interface Recipient { user_id: string; role: Role; lang: Lang; telegram_chat_id: number | null; push: PushSub[] }
export interface AlertReading { id: string; type: ReadingType; context: SugarContext | null; value1: number; value2: number | null }

export interface TickStore {
  households(): Promise<{ id: string; timezone: string; missed_wait_minutes: number }[]>
  activeMedTimes(hid: string): Promise<MedTime[]>
  doses(hid: string, fromIso: string, toIso: string): Promise<DoseRow[]>
  insertDoses(hid: string, rows: { medication_id: string; scheduled_at: string }[]): Promise<void>
  deleteDoses(ids: string[]): Promise<void>
  claimReminded(ids: string[]): Promise<string[]>
  claimMissed(ids: string[]): Promise<string[]>
  unclaimMissed(ids: string[]): Promise<void>
  claimLateAlerted(ids: string[]): Promise<string[]>
  readingsToAlert(hid: string): Promise<AlertReading[]>
  claimReadingAlerted(ids: string[]): Promise<string[]>
  appointments(hid: string, fromIso: string, toIso: string): Promise<ApptRow[]>
  claimAppointment(id: string, which: 'day_before' | 'day_of'): Promise<boolean>
  recipients(hid: string): Promise<Recipient[]>
  removePushSubscription(id: string): Promise<void>
}

export interface Notifier {
  push(sub: PushSub, payload: { title: string; body: string; tag: string }): Promise<'ok' | 'gone'>
  telegram(chatId: number, text: string): Promise<void>
}

type Household = { id: string; timezone: string; missed_wait_minutes: number }
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function runTick(store: TickStore, notifier: Notifier, now: Date): Promise<{ households: number; errors: string[] }> {
  const errors: string[] = []
  const households = await store.households()
  for (const h of households) {
    try {
      await tickHousehold(h, store, notifier, now, errors)
    } catch (e) {
      errors.push(`household ${h.id}: ${msg(e)}`)
    }
  }
  return { households: households.length, errors }
}

async function tickHousehold(h: Household, store: TickStore, notifier: Notifier, now: Date, errors: string[]) {
  const tz = h.timezone
  const today = localDate(now, tz)

  // 1. Make sure the doses exist for today and tomorrow, and drop ones whose time was removed.
  const medTimes = await store.activeMedTimes(h.id)
  const windowEnd = zonedToUtc(addDays(today, 2), '00:00:00', tz).toISOString()
  const existing = await store.doses(h.id, new Date(now.getTime() - minutes(36 * 60)).toISOString(), windowEnd)
  const plan = planDoses(medTimes, [today, addDays(today, 1)], tz, existing, now)
  if (plan.toInsert.length) await store.insertDoses(h.id, plan.toInsert)
  if (plan.toDeleteIds.length) await store.deleteDoses(plan.toDeleteIds)

  // 2. Work out what is due.
  const doses = await store.doses(h.id, new Date(now.getTime() - minutes(36 * 60)).toISOString(), new Date(now.getTime() + minutes(1)).toISOString())
  const { toRemind, toMiss, lateTaken } = classifyDoses(doses, now, h.missed_wait_minutes)
  const recipients = await store.recipients(h.id)
  const send = makeSender(store, notifier, errors)
  const family = recipients.filter((r) => r.role === 'family')
  const names = (ids: string[], from: DoseRow[]) => from.filter((d) => ids.includes(d.id)).map((d) => d.name)

  // 3. Reminders: elder and helper (push only).
  for (const slot of toRemind) {
    const claimed = await store.claimReminded(slot.doses.map((d) => d.id))
    if (!claimed.length) continue
    const medNames = names(claimed, slot.doses)
    for (const r of recipients.filter((x) => x.role === 'elder' || x.role === 'helper')) {
      const m = doseReminderText(r.lang, formatTime(slot.scheduled_at, tz, r.lang), medNames)
      await send(r, { ...m, tag: `dose-${slot.scheduled_at}` }, { push: true, telegram: false })
    }
  }

  // 4. Missed doses: family (Telegram + push), one message per slot.
  for (const slot of toMiss) {
    const claimed = await store.claimMissed(slot.doses.map((d) => d.id))
    if (!claimed.length) continue
    const medNames = names(claimed, slot.doses)
    let delivered = false
    for (const r of family) {
      const body = missedDoseText(r.lang, formatTime(slot.scheduled_at, tz, r.lang), medNames)
      if (await send(r, { title: appTitle(r.lang), body, tag: `missed-${slot.scheduled_at}` }, { push: true, telegram: true })) delivered = true
    }
    if (!delivered) {
      // Nobody could be told: release the claim so the next run tries again (for a short while).
      await store.unclaimMissed(claimed)
      errors.push(`household ${h.id}: missed-dose alert for ${slot.scheduled_at} reached nobody`)
    }
  }

  // 5. Late "Taken": tell family once.
  if (lateTaken.length) {
    const claimed = await store.claimLateAlerted(lateTaken.map((d) => d.id))
    const bySlot = new Map<string, DoseRow[]>()
    for (const d of lateTaken.filter((x) => claimed.includes(x.id))) bySlot.set(d.scheduled_at, [...(bySlot.get(d.scheduled_at) ?? []), d])
    for (const [slotIso, ds] of bySlot) {
      for (const r of family) {
        const body = lateTakenText(r.lang, formatTime(slotIso, tz, r.lang), ds.map((d) => d.name))
        await send(r, { title: appTitle(r.lang), body, tag: `late-${slotIso}` }, { push: true, telegram: true })
      }
    }
  }

  // 6. Out-of-range readings: family.
  const readings = await store.readingsToAlert(h.id)
  if (readings.length) {
    const claimed = await store.claimReadingAlerted(readings.map((r) => r.id))
    for (const reading of readings.filter((r) => claimed.includes(r.id))) {
      for (const r of family) {
        await send(r, { title: appTitle(r.lang), body: readingAlertText(r.lang, reading), tag: `reading-${reading.id}` }, { push: true, telegram: true })
      }
    }
  }

  // 7. Appointment reminders: everyone.
  const appts = await store.appointments(h.id, new Date(now.getTime() - minutes(60)).toISOString(), new Date(now.getTime() + minutes(60 * 72)).toISOString())
  const due = dueAppointmentReminders(appts, now, tz)
  for (const [list, which] of [[due.dayBefore, 'day_before'], [due.dayOf, 'day_of']] as const) {
    for (const a of list) {
      if (!(await store.claimAppointment(a.id, which))) continue
      for (const r of recipients) {
        const body = appointmentText(r.lang, which, formatTime(a.starts_at, tz, r.lang), a.hospital, a.doctor)
        await send(r, { title: appTitle(r.lang), body, tag: `appt-${a.id}-${which}` }, { push: true, telegram: true })
      }
    }
  }
}

async function attempt<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < tries; i++) {
    try { return await fn() } catch (e) { last = e }
  }
  throw last
}

/** Sends to one person on every channel they have. Resolves true if at least one channel got through. */
function makeSender(store: TickStore, notifier: Notifier, errors: string[]) {
  return async (r: Recipient, p: { title: string; body: string; tag: string }, via: { push: boolean; telegram: boolean }): Promise<boolean> => {
    let delivered = false
    if (via.telegram && r.telegram_chat_id !== null) {
      try { await attempt(() => notifier.telegram(r.telegram_chat_id!, p.body)); delivered = true } catch (e) { errors.push(`telegram ${r.user_id}: ${msg(e)}`) }
    }
    if (via.push) {
      for (const sub of r.push) {
        try {
          const res = await attempt(() => notifier.push(sub, p))
          if (res === 'gone') await store.removePushSubscription(sub.id)
          else delivered = true
        } catch (e) {
          errors.push(`push ${r.user_id}: ${msg(e)}`)
        }
      }
    }
    return delivered
  }
}
