import { expect, it } from 'vitest'
import { parseNumber } from '@shared/numbers'

it('reads Arabic-Indic digits', () => expect(parseNumber('١٢٠')).toBe(120))
it('reads the Arabic decimal mark', () => expect(parseNumber('٣٧٫٥')).toBe(37.5))
it('reads a comma as decimal mark', () => expect(parseNumber('37,5')).toBe(37.5))
it('reads Persian digits', () => expect(parseNumber('۱۲۰')).toBe(120))
it('trims spaces', () => expect(parseNumber(' 98.6 ')).toBe(98.6))
it('rejects nonsense', () => {
  expect(parseNumber('abc')).toBeNull()
  expect(parseNumber('')).toBeNull()
  expect(parseNumber('-5')).toBeNull()
  expect(parseNumber('1.2.3')).toBeNull()
  expect(parseNumber('12abc')).toBeNull()
})
