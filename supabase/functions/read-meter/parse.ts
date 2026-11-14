import { validateReading } from '../_shared/ranges.ts'
import type { MeterResult, ReadingType } from '../_shared/types.ts'

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Turns whatever the model returned into a safe result; anything doubtful becomes "not readable". */
export function toMeterResult(type: ReadingType, raw: unknown): MeterResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { readable: false }
  const o = raw as Record<string, unknown>
  if (o.readable !== true) return { readable: false }
  const value1 = num(o.value1)
  if (value1 === undefined) return { readable: false }
  const value2 = type === 'bp' ? num(o.value2) : undefined
  if (type === 'bp' && value2 === undefined) return { readable: false }
  if (validateReading(type, value1, value2) !== 'ok') return { readable: false }
  const result: MeterResult = { readable: true, value1, confident: o.confident === true }
  if (value2 !== undefined) result.value2 = value2
  const pulse = type === 'bp' ? num(o.pulse) : undefined
  if (pulse !== undefined && pulse >= 20 && pulse <= 250) result.pulse = pulse
  return result
}
