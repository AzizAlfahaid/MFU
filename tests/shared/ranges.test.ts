import { expect, it } from 'vitest'
import { isOutOfRange, rangeKeysFor, validateReading } from '@shared/ranges'

const bp = [
  { key: 'bp_systolic' as const, low: 90, high: 140 },
  { key: 'bp_diastolic' as const, low: 60, high: 90 },
]
it('picks the range keys', () => {
  expect(rangeKeysFor('sugar', 'fasting')).toEqual(['sugar_fasting'])
  expect(rangeKeysFor('sugar', 'after_meal')).toEqual(['sugar_after_meal'])
  expect(rangeKeysFor('bp', null)).toEqual(['bp_systolic', 'bp_diastolic'])
  expect(rangeKeysFor('temp', null)).toEqual(['temp'])
})
it('flags fasting sugar above its range', () => {
  expect(isOutOfRange({ type: 'sugar', context: 'fasting', value1: 140 }, [{ key: 'sugar_fasting', low: 80, high: 130 }])).toBe(true)
})
it('uses the range for the matching context only', () => {
  expect(isOutOfRange({ type: 'sugar', context: 'after_meal', value1: 140 }, [{ key: 'sugar_fasting', low: 80, high: 130 }])).toBe(false)
})
it('flags blood pressure when only diastolic is high', () => {
  expect(isOutOfRange({ type: 'bp', context: null, value1: 120, value2: 95 }, bp)).toBe(true)
  expect(isOutOfRange({ type: 'bp', context: null, value1: 120, value2: 80 }, bp)).toBe(false)
})
it('treats the range limits as inside', () => {
  expect(isOutOfRange({ type: 'temp', context: null, value1: 38 }, [{ key: 'temp', low: 36, high: 38 }])).toBe(false)
  expect(isOutOfRange({ type: 'temp', context: null, value1: 35.9 }, [{ key: 'temp', low: 36, high: 38 }])).toBe(true)
})
it('is false when no range is set', () => {
  expect(isOutOfRange({ type: 'temp', context: null, value1: 41 }, [])).toBe(false)
})
it('rejects implausible readings', () => {
  expect(validateReading('temp', 375)).toBe('implausible')
  expect(validateReading('temp', 37.5)).toBe('ok')
  expect(validateReading('bp', 80, 120)).toBe('implausible')
  expect(validateReading('bp', 120)).toBe('implausible')
  expect(validateReading('bp', 120, 80)).toBe('ok')
  expect(validateReading('sugar', 10)).toBe('implausible')
  expect(validateReading('sugar', 126)).toBe('ok')
  expect(validateReading('sugar', Number.NaN)).toBe('implausible')
})
