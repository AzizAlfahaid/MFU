import { expect, it } from 'vitest'
import { addDays, formatTime, localDate, localTime, zonedToUtc } from '@shared/time'

it('converts Riyadh wall time to UTC', () => {
  expect(zonedToUtc('2026-11-14', '08:00:00', 'Asia/Riyadh').toISOString()).toBe('2026-11-14T05:00:00.000Z')
})
it('finds the local date across midnight', () => {
  expect(localDate(new Date('2026-11-14T22:30:00Z'), 'Asia/Riyadh')).toBe('2026-11-15')
  expect(localDate(new Date('2026-11-14T20:59:00Z'), 'Asia/Riyadh')).toBe('2026-11-14')
})
it('handles a daylight-saving change day', () => {
  expect(zonedToUtc('2026-03-29', '09:00:00', 'Europe/London').toISOString()).toBe('2026-03-29T08:00:00.000Z')
  expect(zonedToUtc('2026-03-28', '09:00:00', 'Europe/London').toISOString()).toBe('2026-03-28T09:00:00.000Z')
})
it('adds days across month ends', () => {
  expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
})
it('reads the local clock time of an instant', () => {
  expect(localTime('2026-11-14T05:00:00+00:00', 'Asia/Riyadh')).toBe('08:00')
})
it('formats times in English and Arabic', () => {
  expect(formatTime('2026-11-14T05:00:00Z', 'Asia/Riyadh', 'en')).toBe('8:00 AM')
  expect(formatTime('2026-11-14T05:00:00Z', 'Asia/Riyadh', 'ar')).toBe('٨:٠٠ ص')
})
