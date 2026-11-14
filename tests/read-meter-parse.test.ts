import { expect, it } from 'vitest'
import { toMeterResult } from '../supabase/functions/read-meter/parse'

it('accepts a clear sugar reading', () => {
  expect(toMeterResult('sugar', { readable: true, value1: 126, value2: null, pulse: null, confident: true }))
    .toEqual({ readable: true, value1: 126, confident: true })
})
it('keeps both blood pressure numbers and the pulse', () => {
  expect(toMeterResult('bp', { readable: true, value1: 128, value2: 82, pulse: 71, confident: true }))
    .toEqual({ readable: true, value1: 128, value2: 82, pulse: 71, confident: true })
})
it('needs the lower blood pressure number', () => {
  expect(toMeterResult('bp', { readable: true, value1: 120, value2: null, pulse: null, confident: true })).toEqual({ readable: false })
})
it('rejects implausible numbers (e.g. a Fahrenheit or mmol/L display)', () => {
  expect(toMeterResult('temp', { readable: true, value1: 98.6, confident: true })).toEqual({ readable: false })
  expect(toMeterResult('sugar', { readable: true, value1: 5.6, confident: true })).toEqual({ readable: false })
  expect(toMeterResult('bp', { readable: true, value1: 80, value2: 120, confident: true })).toEqual({ readable: false })
})
it('passes on a reading the model says it cannot read', () => {
  expect(toMeterResult('sugar', { readable: false, value1: 126, confident: false })).toEqual({ readable: false })
})
it('is not confident unless told so', () => {
  expect(toMeterResult('temp', { readable: true, value1: 37.2 })).toEqual({ readable: true, value1: 37.2, confident: false })
})
it('drops a nonsense pulse but keeps the reading', () => {
  expect(toMeterResult('bp', { readable: true, value1: 120, value2: 80, pulse: 900, confident: true }))
    .toEqual({ readable: true, value1: 120, value2: 80, confident: true })
})
it('survives garbage', () => {
  for (const g of ['garbage', null, 42, [], { readable: 'yes' }, { readable: true, value1: 'x' }]) {
    expect(toMeterResult('sugar', g)).toEqual({ readable: false })
  }
})
