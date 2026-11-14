import { addDays, localDate, localTime, minutes, zonedToUtc } from './time.ts'
import type { ApptRow, DoseRow, MedTime, Slot } from './types.ts'

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

/**
 * Which doses to create and which to drop so each medicine has exactly one dose per daily time.
 * Editing a time mid-day never creates a second dose for the same day, and never takes away a dose that
 * is still coming unless its replacement can still happen (otherwise the new time starts tomorrow).
 */
export function planDoses(
  medTimes: MedTime[], dates: string[], tz: string, existing: DoseRow[], now: Date,
): { toInsert: { medication_id: string; scheduled_at: string }[]; toDeleteIds: string[] } {
  const wantedBy = new Map<string, Set<string>>()
  for (const m of medTimes) wantedBy.set(m.medication_id, new Set([...(wantedBy.get(m.medication_id) ?? []), hhmm(m.time_of_day)]))
  const meds = new Set([...wantedBy.keys(), ...existing.map((d) => d.medication_id)])
  const toInsert: { medication_id: string; scheduled_at: string }[] = []
  const toDeleteIds: string[] = []
  const nowMs = now.getTime()

  for (const med of meds) {
    const wanted = wantedBy.get(med) ?? new Set<string>()
    const byDate = new Map<string, DoseRow[]>()
    for (const d of existing.filter((x) => x.medication_id === med)) {
      const k = localDate(new Date(d.scheduled_at), tz)
      byDate.set(k, [...(byDate.get(k) ?? []), d])
    }
    const days = [...new Set([...dates, ...byDate.keys()])].sort()
    for (const date of days) {
      const here = byDate.get(date) ?? []
      const haveTimes = new Set(here.map((d) => localTime(d.scheduled_at, tz)))
      const candidates = dates.includes(date)
        ? [...wanted].sort().filter((t) => !haveTimes.has(t) && zonedToUtc(date, `${t}:00`, tz).getTime() >= nowMs - minutes(1))
        : []
      const replaceable = here
        .filter((d) => d.status === 'pending' && new Date(d.scheduled_at).getTime() > nowMs && !wanted.has(localTime(d.scheduled_at, tz)))
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      let count = here.length
      let free = Math.max(0, wanted.size - here.length)
      for (const t of candidates) {
        if (free > 0) { free--; count++ }
        else if (replaceable.length) toDeleteIds.push(replaceable.shift()!.id)
        else continue
        toInsert.push({ medication_id: med, scheduled_at: zonedToUtc(date, `${t}:00`, tz).toISOString() })
      }
      while (count > wanted.size && replaceable.length) { toDeleteIds.push(replaceable.shift()!.id); count-- }
    }
  }
  return { toInsert, toDeleteIds }
}

const RETRY_WINDOW_MIN = 30

export function classifyDoses<T extends DoseRow>(doses: T[], now: Date, waitMinutes: number): { toRemind: Slot<T>[]; toMiss: Slot<T>[]; lateTaken: T[] } {
  const nowMs = now.getTime()
  const deadline = (d: DoseRow) => new Date(d.scheduled_at).getTime() + minutes(waitMinutes)
  const pendingDue = doses.filter((d) => d.status === 'pending' && new Date(d.scheduled_at).getTime() <= nowMs)
  // A missed dose nobody could be told about (alert was un-claimed) is retried for a little while.
  const retry = doses.filter((d) => d.status === 'missed' && d.missed_alert_sent_at === null
    && nowMs >= deadline(d) && nowMs < deadline(d) + minutes(RETRY_WINDOW_MIN))
  const toMiss = groupBySlot([...pendingDue.filter((d) => nowMs >= deadline(d)), ...retry])
  const toRemind: Slot<T>[] = []
  for (const slot of groupBySlot(pendingDue.filter((d) => nowMs < deadline(d)))) {
    const fresh = slot.doses.filter((d) => d.reminder_sent_at === null)
    if (fresh.length) toRemind.push({ scheduled_at: slot.scheduled_at, doses: fresh })
  }
  return { toRemind, toMiss, lateTaken: doses.filter((d) => d.status === 'taken_late' && d.late_alert_sent_at === null) }
}

/** Should the "Taken" button be offered for these doses of one slot? Mirrors the database rule. */
export function canMarkTaken(slotDoses: DoseRow[], all: DoseRow[], now: Date): boolean {
  const nowMs = now.getTime()
  return slotDoses.some((d) => {
    const at = new Date(d.scheduled_at).getTime()
    if (d.status === 'pending') return at <= nowMs
    if (d.status !== 'missed') return false
    return !all.some((o) => o.medication_id === d.medication_id && new Date(o.scheduled_at).getTime() > at && new Date(o.scheduled_at).getTime() <= nowMs)
  })
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
