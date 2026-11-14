import { beforeEach, describe, expect, it } from 'vitest'
import { runTick } from '../supabase/functions/tick/run'
import { FakeNotifier, FakeStore, at, iso, standardHousehold } from './helpers/fakes'

let store: FakeStore
let notifier: FakeNotifier
const tick = (local: string) => runTick(store, notifier, at(local))

beforeEach(() => { store = new FakeStore(); notifier = new FakeNotifier(); standardHousehold(store) })

describe('dose creation', () => {
  it('creates today and tomorrow, and a second run adds nothing', async () => {
    await tick('2026-11-14T07:00:00')
    expect(store.doseList()).toHaveLength(4)
    await tick('2026-11-14T07:01:00')
    expect(store.doseList()).toHaveLength(4)
  })
  it('removes a pending future dose when its time is removed, keeping the morning history', async () => {
    store.medTimes.h1 = [{ medication_id: 'm1', name: 'Metformin', time_of_day: '08:00:00' }, { medication_id: 'm1', name: 'Metformin', time_of_day: '20:00:00' }]
    await tick('2026-11-14T07:00:00')
    store.doseList().find((d) => d.scheduled_at === iso('2026-11-14T08:00:00'))!.status = 'taken'
    store.medTimes.h1 = [{ medication_id: 'm1', name: 'Metformin', time_of_day: '08:00:00' }]
    await tick('2026-11-14T12:00:00')
    const left = store.doseList().map((d) => d.scheduled_at).sort()
    expect(left).toEqual([iso('2026-11-14T08:00:00'), iso('2026-11-15T08:00:00')])
    expect(store.doseList().find((d) => d.scheduled_at === iso('2026-11-14T08:00:00'))!.status).toBe('taken')
  })
})

describe('reminders', () => {
  it('elder and helper get one push naming both medicines; family get none', async () => {
    await tick('2026-11-14T07:00:00')
    await tick('2026-11-14T08:05:00')
    for (const who of ['elder', 'helper']) {
      const p = notifier.pushesTo(`https://push/${who}`)
      expect(p).toHaveLength(1)
      expect(`${p[0].title} ${p[0].body}`).toContain('Metformin')
      expect(`${p[0].title} ${p[0].body}`).toContain('Aspirin')
    }
    expect(notifier.pushesTo('https://push/fam1')).toHaveLength(0)
    expect(notifier.texts).toHaveLength(0)
  })
  it('speaks each person\'s language', async () => {
    await tick('2026-11-14T07:00:00')
    await tick('2026-11-14T08:05:00')
    expect(notifier.pushesTo('https://push/elder')[0].body).toMatch(/[؀-ۿ]/)
    expect(notifier.pushesTo('https://push/helper')[0].body).toContain('medicine')
  })
  it('sends the reminder once however often the job runs', async () => {
    await tick('2026-11-14T07:00:00')
    await tick('2026-11-14T08:05:00')
    await tick('2026-11-14T08:06:00')
    expect(notifier.pushesTo('https://push/elder')).toHaveLength(1)
  })
})

describe('missed doses', () => {
  it('after the wait, family are told once by Telegram and push, with both medicines; elder is not', async () => {
    await tick('2026-11-14T07:00:00')
    await tick('2026-11-14T08:35:00')
    expect(store.doseList().filter((d) => d.scheduled_at === iso('2026-11-14T08:00:00')).every((d) => d.status === 'missed')).toBe(true)
    expect(notifier.textsTo(111)).toHaveLength(1)
    expect(notifier.textsTo(111)[0].text).toContain('Metformin')
    expect(notifier.textsTo(111)[0].text).toContain('Aspirin')
    expect(notifier.textsTo(222)).toHaveLength(1)
    expect(notifier.pushesTo('https://push/fam1')).toHaveLength(1)
    expect(notifier.pushesTo('https://push/elder')).toHaveLength(0)
  })
  it('two overlapping runs send exactly one alert per family member', async () => {
    await tick('2026-11-14T07:00:00')
    await Promise.all([tick('2026-11-14T08:35:00'), tick('2026-11-14T08:35:00')])
    expect(notifier.textsTo(111)).toHaveLength(1)
    expect(notifier.textsTo(222)).toHaveLength(1)
    expect(notifier.pushesTo('https://push/fam1')).toHaveLength(1)
  })
  it('a run after a long outage marks the dose missed with one alert and no stale reminder', async () => {
    await tick('2026-11-14T07:59:00')
    await tick('2026-11-14T09:15:00')
    expect(notifier.textsTo(111)).toHaveLength(1)
    expect(notifier.pushesTo('https://push/elder')).toHaveLength(0)
  })
  it('does not alert for a dose that was taken', async () => {
    await tick('2026-11-14T07:00:00')
    for (const d of store.doseList()) if (d.scheduled_at === iso('2026-11-14T08:00:00')) d.status = 'taken'
    await tick('2026-11-14T08:35:00')
    expect(notifier.texts).toHaveLength(0)
  })
  it('tells family once when a missed dose is taken late', async () => {
    await tick('2026-11-14T07:00:00')
    await tick('2026-11-14T08:35:00')
    notifier.texts.length = 0
    for (const d of store.doseList()) if (d.scheduled_at === iso('2026-11-14T08:00:00')) d.status = 'taken_late'
    await tick('2026-11-14T08:50:00')
    expect(notifier.textsTo(111)).toHaveLength(1)
    expect(notifier.textsTo(111)[0].text).toContain('Metformin')
    await tick('2026-11-14T08:51:00')
    expect(notifier.textsTo(111)).toHaveLength(1)
  })
})

describe('out-of-range readings', () => {
  it('alerts family once', async () => {
    store.readings.push({ id: 'r1', type: 'bp', context: null, value1: 170, value2: 100, out_of_range: true, alert_sent_at: null })
    await tick('2026-11-14T07:00:00')
    expect(notifier.textsTo(111)).toHaveLength(1)
    expect(notifier.textsTo(111)[0].text).toContain('170/100')
    expect(notifier.textsTo(222)).toHaveLength(1)
    await tick('2026-11-14T07:01:00')
    expect(notifier.textsTo(111)).toHaveLength(1)
  })
})

describe('appointments', () => {
  beforeEach(() => {
    store.appts.push({ household_id: 'h1', id: 'a1', starts_at: iso('2026-11-15T10:00:00'), hospital: 'King Fahd', doctor: 'Dr Sara', purpose: null, day_before_sent_at: null, day_of_sent_at: null })
  })
  it('everyone gets the day-before reminder once', async () => {
    await tick('2026-11-14T17:59:00')
    expect(notifier.pushes.filter((p) => p.body.includes('King Fahd'))).toHaveLength(0)
    await tick('2026-11-14T18:00:00')
    await tick('2026-11-14T18:01:00')
    for (const who of ['elder', 'helper', 'fam1']) expect(notifier.pushesTo(`https://push/${who}`).filter((p) => p.body.includes('King Fahd'))).toHaveLength(1)
    expect(notifier.textsTo(111)).toHaveLength(1)
    expect(notifier.textsTo(222)).toHaveLength(1)
  })
  it('sends the day-of reminder on the morning', async () => {
    await tick('2026-11-15T08:00:00')
    expect(notifier.pushesTo('https://push/elder').filter((p) => p.body.includes('King Fahd'))).toHaveLength(1)
  })
})

describe('failures', () => {
  it('removes a push subscription the push service says is gone', async () => {
    notifier.pushResult['https://push/elder'] = 'gone'
    await tick('2026-11-14T07:00:00')
    await tick('2026-11-14T08:05:00')
    expect(store.removedSubs).toEqual(['elder'])
  })
  it('one failing Telegram chat does not stop the others and is reported', async () => {
    notifier.failChat = 111
    await tick('2026-11-14T07:00:00')
    const r = await tick('2026-11-14T08:35:00')
    expect(notifier.textsTo(222)).toHaveLength(1)
    expect(r.errors.length).toBeGreaterThan(0)
  })
  it('a family member with no Telegram and no push is simply skipped', async () => {
    await tick('2026-11-14T07:00:00')
    const r = await tick('2026-11-14T08:35:00')
    expect(r.errors).toEqual([])
  })
  it('one household failing does not stop another', async () => {
    store.hh.push({ id: 'h2', timezone: 'Asia/Riyadh', missed_wait_minutes: 30 })
    store.medTimes.h2 = [{ medication_id: 'x1', name: 'Other', time_of_day: '08:00:00' }]
    store.recips.h2 = []
    store.failMedTimesFor = 'h1'
    const r = await tick('2026-11-14T07:00:00')
    expect(r.households).toBe(2)
    expect(r.errors.some((e) => e.includes('h1'))).toBe(true)
    expect(store.doseList('h2').length).toBeGreaterThan(0)
  })
})

describe('a missed-dose alert is never lost silently', () => {
  it('retries a failed Telegram send within the same run', async () => {
    notifier.chatFailuresLeft.set(111, 2)
    await tick('2026-11-14T07:00:00')
    const r = await tick('2026-11-14T08:35:00')
    expect(notifier.textsTo(111)).toHaveLength(1)
    expect(r.errors).toEqual([])
  })
  it('tries again next minute when nobody could be reached, then delivers once', async () => {
    notifier.failChats.add(111); notifier.failChats.add(222); notifier.pushThrows.add('https://push/fam1')
    await tick('2026-11-14T07:00:00')
    const first = await tick('2026-11-14T08:35:00')
    expect(first.errors.some((e) => e.includes('reached nobody'))).toBe(true)
    expect(notifier.texts).toHaveLength(0)
    expect(store.doseList().filter((d) => d.scheduled_at === iso('2026-11-14T08:00:00')).every((d) => d.status === 'missed' && d.missed_alert_sent_at === null)).toBe(true)
    notifier.failChats.clear(); notifier.pushThrows.clear()
    await tick('2026-11-14T08:36:00')
    await tick('2026-11-14T08:37:00')
    expect(notifier.textsTo(111)).toHaveLength(1)
    expect(notifier.textsTo(222)).toHaveLength(1)
  })
  it('stops retrying after the retry window and keeps the dose marked missed', async () => {
    store.recips.h1 = store.recips.h1.filter((r) => r.user_id === 'fam3' || r.role !== 'family')
    await tick('2026-11-14T07:00:00')
    const r = await tick('2026-11-14T08:35:00')
    expect(r.errors.some((e) => e.includes('reached nobody'))).toBe(true)
    const later = await tick('2026-11-14T09:05:00')
    expect(later.errors.some((e) => e.includes('reached nobody'))).toBe(false)
    expect(store.doseList().filter((d) => d.scheduled_at === iso('2026-11-14T08:00:00')).every((d) => d.status === 'missed')).toBe(true)
  })
  it('does not un-claim when at least one family member was reached', async () => {
    notifier.failChats.add(111)
    await tick('2026-11-14T07:00:00')
    await tick('2026-11-14T08:35:00')
    await tick('2026-11-14T08:36:00')
    expect(notifier.textsTo(222)).toHaveLength(1)
  })
})
