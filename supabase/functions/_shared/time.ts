import type { Lang } from './types'

const MIN = 60_000

function parts(instant: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const o: Record<string, number> = {}
  for (const p of f.formatToParts(instant)) if (p.type !== 'literal') o[p.type] = Number(p.value)
  return o
}

/** Offset of `tz` from UTC at `instant`, in ms (positive east of UTC). */
function offsetMs(instant: Date, tz: string): number {
  const p = parts(instant, tz)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

export function localDate(now: Date, tz: string): string {
  const p = parts(now, tz)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** 'HH:MM' on the clock in `tz`. */
export function localTime(iso: string, tz: string): string {
  const p = parts(new Date(iso), tz)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** The instant at which the wall clock in `tz` reads `date` `time`. */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm, ss] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm, ss || 0)
  let result = guess - offsetMs(new Date(guess), tz)
  const second = guess - offsetMs(new Date(result), tz)
  if (second !== result) result = second
  return new Date(result)
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function formatTime(iso: string, tz: string, lang: Lang): string {
  const f = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-arab' : 'en-US', {
    timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true,
  })
  return f.format(new Date(iso)).replace(/\s/g, ' ')
}

export const minutes = (n: number) => n * MIN
