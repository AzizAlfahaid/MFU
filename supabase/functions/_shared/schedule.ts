import { addDays, localDate, localTime, minutes, zonedToUtc } from './time'
import type { ApptRow, DoseRow, MedTime, Slot } from './types'

const norm = (iso: string) => new Date(iso).toISOString()
const hhmm = (t: string) => t.slice(0, 5)

export function groupBySlot<T extends DoseRow>(doses: T[]): Slot<T>[] {
  const map = new Map<string, T[]>()
  for (const d of doses) {
    const k = norm(d.scheduled_at)
    map.set(k, [...(map.get(k) ?? []), d])
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([scheduled_at, ds]) => ({ scheduled_at, doses: ds }))
}

export function planDoses(
  medTimes: MedTime[], dates: string[], tz: string, existing: DoseRow[], now: Date,
): { toInsert: { medication_id: string; scheduled_at: string }[]; toDeleteIds: string[] } {
  const have = new Set(existing.map((d) => `${d.medication_id}|${norm(d.scheduled_at)}`))
  const toInsert: { medication_id: string; scheduled_at: string }[] = []
  for (const date of dates) {
    for (const mt of medTimes) {
      const at = zonedToUtc(date, mt.time_of_day, tz)
      if (at.getTime() < now.getTime() - minutes(1)) continue // never invent doses in the past
      const key = `${mt.medication_id}|${at.toISOString()}`
      if (have.has(key)) continue
      have.add(key)
      toInsert.push({ medication_id: mt.medication_id, scheduled_at: at.toISOString() })
    }
  }
  const wanted = new Set(medTimes.map((m) => `${m.medication_id}|${hhmm(m.time_of_day)}`))
  const toDeleteIds = existing
    .filter((d) => d.status === 'pending' && new Date(d.scheduled_at).getTime() > now.getTime()
      && !wanted.has(`${d.medication_id}|${localTime(d.scheduled_at, tz)}`))
    .map((d) => d.id)
  return { toInsert, toDeleteIds }
}

export function classifyDoses<T extends DoseRow>(doses: T[], now: Date, waitMinutes: number): { toRemind: Slot<T>[]; toMiss: Slot<T>[]; lateTaken: T[] } {
  const pendingDue = doses.filter((d) => d.status === 'pending' && new Date(d.scheduled_at).getTime() <= now.getTime())
  const toRemind: Slot<T>[] = []
  const toMiss: Slot<T>[] = []
  for (const slot of groupBySlot(pendingDue)) {
    const deadline = new Date(slot.scheduled_at).getTime() + minutes(waitMinutes)
    if (now.getTime() >= deadline) toMiss.push(slot)
    else {
      const fresh = slot.doses.filter((d) => d.reminder_sent_at === null)
      if (fresh.length) toRemind.push({ scheduled_at: slot.scheduled_at, doses: fresh })
    }
  }
  return { toRemind, toMiss, lateTaken: doses.filter((d) => d.status === 'taken_late' && d.late_alert_sent_at === null) }
}

/**
 * The slot the elder's popup should show right now, or null: the earliest due pending slot,
 * else the latest missed slot (still within `missedWindowMinutes`) that has no later due dose.
 */
export function activeSlot<T extends DoseRow>(doses: T[], now: Date, missedWindowMinutes = 120): Slot<T> | null {
  const due = doses.filter((d) => new Date(d.scheduled_at).getTime() <= now.getTime())
  const pending = groupBySlot(due.filter((d) => d.status === 'pending'))
  if (pending.length) return pending[0]
  const missed = due.filter(
    (d) => d.status === 'missed'
      && now.getTime() - new Date(d.scheduled_at).getTime() < minutes(missedWindowMinutes)
      && !due.some((o) => o.medication_id === d.medication_id && new Date(o.scheduled_at) > new Date(d.scheduled_at)),
  )
  const slots = groupBySlot(missed)
  return slots.length ? slots[slots.length - 1] : null
}

export function dueAppointmentReminders(appts: ApptRow[], now: Date, tz: string): { dayBefore: ApptRow[]; dayOf: ApptRow[] } {
  const dayBefore: ApptRow[] = []
  const dayOf: ApptRow[] = []
  for (const a of appts) {
    const start = new Date(a.starts_at)
    if (now.getTime() >= start.getTime()) continue
    const date = localDate(start, tz)
    const startOfDay = zonedToUtc(date, '00:00:00', tz)
    const eveningBefore = zonedToUtc(addDays(date, -1), '18:00:00', tz)
    if (!a.day_before_sent_at && now >= eveningBefore && now < startOfDay) dayBefore.push(a)
    const early = Number(localTime(a.starts_at, tz).slice(0, 2)) < 10
    const dayOfFrom = early ? new Date(start.getTime() - minutes(120)) : zonedToUtc(date, '08:00:00', tz)
    if (!a.day_of_sent_at && now >= dayOfFrom) dayOf.push(a)
  }
  return { dayBefore, dayOf }
}
