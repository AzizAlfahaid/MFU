import { describe, expect, it } from 'vitest'
import { activeSlot, canMarkTaken, classifyDoses, dueAppointmentReminders, groupBySlot, planDoses } from '@shared/schedule'
import type { ApptRow, DoseRow, MedTime } from '@shared/types'

const TZ = 'Asia/Riyadh'
const at = (local: string) => new Date(`${local}+03:00`) // Riyadh wall time -> instant
const iso = (local: string) => at(local).toISOString()
const dose = (id: string, med: string, local: string, status: DoseRow['status'] = 'pending', extra: Partial<DoseRow> = {}): DoseRow => ({
  id, medication_id: med, name: med, scheduled_at: iso(local), status,
  reminder_sent_at: null, missed_alert_sent_at: null, late_alert_sent_at: null, ...extra,
})
const mt = (med: string, t: string): MedTime => ({ medication_id: med, name: med, time_of_day: t })

// ---------- planDoses ----------
it('inserts only the missing dose', () => {
  const plan = planDoses([mt('m1', '08:00:00'), mt('m2', '08:00:00')], ['2026-11-14'], TZ,
    [dose('d1', 'm1', '2026-11-14T08:00:00')], at('2026-11-14T07:00:00'))
  expect(plan.toInsert).toEqual([{ medication_id: 'm2', scheduled_at: iso('2026-11-14T08:00:00') }])
  expect(plan.toDeleteIds).toEqual([])
})
it('plans today and tomorrow', () => {
  const plan = planDoses([mt('m1', '08:00:00')], ['2026-11-14', '2026-11-15'], TZ, [], at('2026-11-14T07:00:00'))
  expect(plan.toInsert.map((r) => r.scheduled_at)).toEqual([iso('2026-11-14T08:00:00'), iso('2026-11-15T08:00:00')])
})
it('does not create doses for times already past (new medicine added mid-day)', () => {
  const plan = planDoses([mt('m1', '08:00:00')], ['2026-11-14'], TZ, [], at('2026-11-14T10:00:00'))
  expect(plan.toInsert).toEqual([])
})
it('deletes future pending doses of removed times and inactive medicines, nothing else', () => {
  const existing = [
    dose('future-removed', 'm1', '2026-11-14T20:00:00'),
    dose('future-inactive', 'm9', '2026-11-14T21:00:00'),
    dose('future-kept', 'm1', '2026-11-15T08:00:00'),
    dose('past-taken', 'm1', '2026-11-14T08:00:00', 'taken'),
    dose('past-pending', 'm1', '2026-11-14T09:00:00'),
    dose('future-taken', 'm1', '2026-11-14T22:00:00', 'taken'),
  ]
  const plan = planDoses([mt('m1', '08:00:00')], ['2026-11-14', '2026-11-15'], TZ, existing, at('2026-11-14T12:00:00'))
  expect(plan.toDeleteIds.sort()).toEqual(['future-inactive', 'future-removed'])
})
it('matches stored dates written with a +00:00 offset', () => {
  const stored = { ...dose('d1', 'm1', '2026-11-14T08:00:00'), scheduled_at: '2026-11-14T05:00:00+00:00' }
  const plan = planDoses([mt('m1', '08:00:00')], ['2026-11-14'], TZ, [stored], at('2026-11-14T07:00:00'))
  expect(plan.toInsert).toEqual([])
})

// ---------- classifyDoses ----------
it('reminds one slot holding both medicines', () => {
  const r = classifyDoses([dose('a', 'm1', '2026-11-14T08:00:00'), dose('b', 'm2', '2026-11-14T08:00:00')], at('2026-11-14T08:10:00'), 30)
  expect(r.toRemind).toHaveLength(1)
  expect(r.toRemind[0].doses.map((d) => d.id).sort()).toEqual(['a', 'b'])
  expect(r.toMiss).toEqual([])
})
it('does not remind twice', () => {
  const sent = { reminder_sent_at: iso('2026-11-14T08:00:00') }
  const r = classifyDoses([dose('a', 'm1', '2026-11-14T08:00:00', 'pending', sent)], at('2026-11-14T08:10:00'), 30)
  expect(r.toRemind).toEqual([])
  expect(r.toMiss).toEqual([])
})
it('misses exactly at the wait time', () => {
  const r = classifyDoses([dose('a', 'm1', '2026-11-14T08:00:00')], at('2026-11-14T08:30:00'), 30)
  expect(r.toMiss).toHaveLength(1)
  expect(r.toRemind).toEqual([])
})
it('goes straight to missed when ticks were skipped', () => {
  const r = classifyDoses([dose('a', 'm1', '2026-11-14T08:00:00')], at('2026-11-14T09:15:00'), 30)
  expect(r.toMiss).toHaveLength(1)
  expect(r.toRemind).toEqual([])
})
it('handles a 23:50 dose across midnight', () => {
  const d = [dose('a', 'm1', '2026-11-14T23:50:00')]
  expect(classifyDoses(d, at('2026-11-15T00:05:00'), 30).toRemind).toHaveLength(1)
  expect(classifyDoses(d, at('2026-11-15T00:20:00'), 30).toMiss).toHaveLength(1)
})
it('ignores future and finished doses', () => {
  const d = [dose('a', 'm1', '2026-11-14T09:00:00'), dose('b', 'm1', '2026-11-14T07:00:00', 'taken'), dose('c', 'm1', '2026-11-14T06:00:00', 'missed')]
  const r = classifyDoses(d, at('2026-11-14T08:00:00'), 30)
  expect(r.toRemind).toEqual([])
  expect(r.toMiss).toEqual([])
})
it('lists late-taken doses not yet announced', () => {
  const d = [dose('a', 'm1', '2026-11-14T08:00:00', 'taken_late'), dose('b', 'm1', '2026-11-14T07:00:00', 'taken_late', { late_alert_sent_at: iso('2026-11-14T08:00:00') })]
  expect(classifyDoses(d, at('2026-11-14T09:00:00'), 30).lateTaken.map((x) => x.id)).toEqual(['a'])
})

// ---------- groupBySlot / activeSlot ----------
it('groups by slot in time order', () => {
  const g = groupBySlot([dose('b', 'm1', '2026-11-14T20:00:00'), dose('a', 'm1', '2026-11-14T08:00:00'), dose('c', 'm2', '2026-11-14T08:00:00')])
  expect(g.map((s) => s.doses.length)).toEqual([2, 1])
  expect(g[0].scheduled_at).toBe(iso('2026-11-14T08:00:00'))
})
it('active slot is the earliest due pending slot', () => {
  const s = activeSlot([dose('a', 'm1', '2026-11-14T08:00:00'), dose('b', 'm2', '2026-11-14T08:00:00'), dose('c', 'm1', '2026-11-14T20:00:00')], at('2026-11-14T08:05:00'))
  expect(s?.doses.map((d) => d.id).sort()).toEqual(['a', 'b'])
})
it('no active slot when the only dose is in the future', () => {
  expect(activeSlot([dose('a', 'm1', '2026-11-14T20:00:00')], at('2026-11-14T08:05:00'))).toBeNull()
})
it('a missed slot stays active until a later dose of the same medicine is due', () => {
  const missed = dose('a', 'm1', '2026-11-14T08:00:00', 'missed')
  expect(activeSlot([missed], at('2026-11-14T09:00:00'))?.doses.map((d) => d.id)).toEqual(['a'])
  const later = dose('b', 'm1', '2026-11-14T20:00:00', 'pending')
  expect(activeSlot([missed, later], at('2026-11-14T20:01:00'))?.doses.map((d) => d.id)).toEqual(['b'])
  expect(activeSlot([missed, dose('b', 'm1', '2026-11-14T20:00:00', 'taken')], at('2026-11-14T21:00:00'))).toBeNull()
})

// ---------- dueAppointmentReminders ----------
const appt = (local: string, extra: Partial<ApptRow> = {}): ApptRow => ({
  id: 'x', starts_at: iso(local), hospital: 'H', doctor: 'D', purpose: null, day_before_sent_at: null, day_of_sent_at: null, ...extra,
})
it('day-before reminder starts at 18:00 the evening before', () => {
  const a = appt('2026-11-15T10:00:00')
  expect(dueAppointmentReminders([a], at('2026-11-14T17:59:00'), TZ)).toEqual({ dayBefore: [], dayOf: [] })
  expect(dueAppointmentReminders([a], at('2026-11-14T18:00:00'), TZ).dayBefore).toEqual([a])
})
it('day-of reminder starts at 08:00', () => {
  const a = appt('2026-11-15T10:00:00')
  expect(dueAppointmentReminders([a], at('2026-11-15T07:59:00'), TZ).dayOf).toEqual([])
  expect(dueAppointmentReminders([a], at('2026-11-15T08:00:00'), TZ).dayOf).toEqual([a])
})
it('an appointment before 10:00 is reminded two hours ahead', () => {
  const a = appt('2026-11-15T08:30:00')
  expect(dueAppointmentReminders([a], at('2026-11-15T06:29:00'), TZ).dayOf).toEqual([])
  expect(dueAppointmentReminders([a], at('2026-11-15T06:30:00'), TZ).dayOf).toEqual([a])
})
it('an appointment created the same day gets only the day-of reminder', () => {
  const r = dueAppointmentReminders([appt('2026-11-14T15:00:00')], at('2026-11-14T09:00:00'), TZ)
  expect(r.dayBefore).toEqual([])
  expect(r.dayOf).toHaveLength(1)
})
it('sends nothing after the start time or when already sent', () => {
  expect(dueAppointmentReminders([appt('2026-11-14T15:00:00')], at('2026-11-14T15:00:00'), TZ)).toEqual({ dayBefore: [], dayOf: [] })
  const sent = appt('2026-11-15T10:00:00', { day_before_sent_at: iso('2026-11-14T18:00:00'), day_of_sent_at: iso('2026-11-15T08:00:00') })
  expect(dueAppointmentReminders([sent], at('2026-11-14T19:00:00'), TZ).dayBefore).toEqual([])
  expect(dueAppointmentReminders([sent], at('2026-11-15T09:00:00'), TZ).dayOf).toEqual([])
})

it('a missed slot stops being active after the window (default 2 hours)', () => {
  const missed = dose('a', 'm1', '2026-11-14T08:00:00', 'missed')
  expect(activeSlot([missed], at('2026-11-14T09:59:00'))).not.toBeNull()
  expect(activeSlot([missed], at('2026-11-14T10:01:00'))).toBeNull()
  expect(activeSlot([missed], at('2026-11-14T10:01:00'), 180)).not.toBeNull()
})
it('a pending due slot stays active however late it is', () => {
  expect(activeSlot([dose('a', 'm1', '2026-11-14T08:00:00')], at('2026-11-14T15:00:00'))).not.toBeNull()
})

// ---------- final-review fixes ----------
describe('planDoses when a medicine time is edited mid-day', () => {
  const now = at('2026-11-14T09:00:00')
  it('moving a taken morning dose later does not create a second dose today', () => {
    const existing = [dose('m', 'm1', '2026-11-14T08:00:00', 'taken'), dose('t', 'm1', '2026-11-15T08:00:00')]
    const plan = planDoses([mt('m1', '10:00:00')], ['2026-11-14', '2026-11-15'], TZ, existing, now)
    expect(plan.toInsert).toEqual([{ medication_id: 'm1', scheduled_at: iso('2026-11-15T10:00:00') }])
    expect(plan.toDeleteIds).toEqual(['t'])
  })
  it('moving this evening\'s dose earlier (new time already past) keeps tonight\'s dose and changes from tomorrow', () => {
    const existing = [dose('tonight', 'm1', '2026-11-14T20:00:00'), dose('tomorrow', 'm1', '2026-11-15T20:00:00')]
    const plan = planDoses([mt('m1', '08:00:00')], ['2026-11-14', '2026-11-15'], TZ, existing, now)
    expect(plan.toDeleteIds).toEqual(['tomorrow'])
    expect(plan.toInsert).toEqual([{ medication_id: 'm1', scheduled_at: iso('2026-11-15T08:00:00') }])
  })
  it('moving a future dose to another future time today replaces it', () => {
    const existing = [dose('old', 'm1', '2026-11-14T20:00:00')]
    const plan = planDoses([mt('m1', '21:00:00')], ['2026-11-14'], TZ, existing, now)
    expect(plan.toDeleteIds).toEqual(['old'])
    expect(plan.toInsert).toEqual([{ medication_id: 'm1', scheduled_at: iso('2026-11-14T21:00:00') }])
  })
  it('adding a second daily time adds a dose without removing the first', () => {
    const existing = [dose('a', 'm1', '2026-11-14T08:00:00', 'taken')]
    const plan = planDoses([mt('m1', '08:00:00'), mt('m1', '20:00:00')], ['2026-11-14'], TZ, existing, now)
    expect(plan.toInsert).toEqual([{ medication_id: 'm1', scheduled_at: iso('2026-11-14T20:00:00') }])
    expect(plan.toDeleteIds).toEqual([])
  })
})

describe('classifyDoses retries a missed dose nobody could be told about', () => {
  const missedUnalerted = (id: string, local: string) => dose(id, 'm1', local, 'missed')
  it('retries within 30 minutes after the wait', () => {
    const r = classifyDoses([missedUnalerted('a', '2026-11-14T08:00:00')], at('2026-11-14T08:50:00'), 30)
    expect(r.toMiss).toHaveLength(1)
  })
  it('stops retrying later', () => {
    const r = classifyDoses([missedUnalerted('a', '2026-11-14T08:00:00')], at('2026-11-14T09:05:00'), 30)
    expect(r.toMiss).toEqual([])
  })
  it('never alerts twice for one that was already announced', () => {
    const d = dose('a', 'm1', '2026-11-14T08:00:00', 'missed', { missed_alert_sent_at: iso('2026-11-14T08:30:00') })
    expect(classifyDoses([d], at('2026-11-14T08:50:00'), 30).toMiss).toEqual([])
  })
})

describe('canMarkTaken', () => {
  const now = at('2026-11-14T15:00:00')
  it('allows a due pending slot', () => {
    expect(canMarkTaken([dose('a', 'm1', '2026-11-14T14:00:00')], [], now)).toBe(true)
  })
  it('does not allow a future slot', () => {
    expect(canMarkTaken([dose('a', 'm1', '2026-11-14T20:00:00')], [], now)).toBe(false)
  })
  it('allows a missed dose until the next dose of that medicine is due', () => {
    const missed = dose('a', 'm1', '2026-11-14T08:00:00', 'missed')
    expect(canMarkTaken([missed], [missed], at('2026-11-14T09:00:00'))).toBe(true)
    const later = dose('b', 'm1', '2026-11-14T14:00:00', 'pending')
    expect(canMarkTaken([missed], [missed, later], now)).toBe(false)
  })
  it('does not allow a slot that is all taken', () => {
    expect(canMarkTaken([dose('a', 'm1', '2026-11-14T08:00:00', 'taken')], [], now)).toBe(false)
  })
})
