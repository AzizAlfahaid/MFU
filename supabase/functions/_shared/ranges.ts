import type { RangeKey, ReadingType, SugarContext } from './types'

export function rangeKeysFor(type: ReadingType, context: SugarContext | null): RangeKey[] {
  if (type === 'sugar') return [`sugar_${context ?? 'other'}` as RangeKey]
  if (type === 'bp') return ['bp_systolic', 'bp_diastolic']
  return ['temp']
}

interface ReadingLike { type: ReadingType; context: SugarContext | null; value1: number; value2?: number | null }

export function isOutOfRange(reading: ReadingLike, ranges: { key: RangeKey; low: number; high: number }[]): boolean {
  const keys = rangeKeysFor(reading.type, reading.context)
  const values = [reading.value1, reading.value2]
  return keys.some((key, i) => {
    const v = values[i]
    const r = ranges.find((x) => x.key === key)
    if (!r || v === null || v === undefined) return false
    return v < r.low || v > r.high
  })
}

const within = (v: number, lo: number, hi: number) => Number.isFinite(v) && v >= lo && v <= hi

export function validateReading(type: ReadingType, value1: number, value2?: number | null): 'ok' | 'implausible' {
  if (type === 'sugar') return within(value1, 20, 600) ? 'ok' : 'implausible'
  if (type === 'temp') return within(value1, 30, 45) ? 'ok' : 'implausible'
  if (value2 === null || value2 === undefined) return 'implausible'
  return within(value1, 50, 260) && within(value2, 30, 160) && value2 < value1 ? 'ok' : 'implausible'
}
