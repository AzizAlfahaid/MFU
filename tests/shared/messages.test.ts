import { expect, it } from 'vitest'
import { appointmentText, doseReminderText, lateTakenText, missedDoseText, readingAlertText } from '@shared/messages'

it('dose reminder names every medicine and the time in both languages', () => {
  for (const lang of ['ar', 'en'] as const) {
    const m = doseReminderText(lang, '8:00', ['Metformin', 'Aspirin'])
    const all = `${m.title} ${m.body}`
    expect(all).toContain('Metformin'); expect(all).toContain('Aspirin'); expect(all).toContain('8:00')
  }
})
it('missed and late messages name every medicine and the time', () => {
  for (const lang of ['ar', 'en'] as const) {
    for (const f of [missedDoseText, lateTakenText]) {
      const t = f(lang, '8:00', ['Metformin', 'Aspirin'])
      expect(t).toContain('Metformin'); expect(t).toContain('Aspirin'); expect(t).toContain('8:00')
    }
  }
})
it('reading alert states the value and the range only, with no advice', () => {
  const en = readingAlertText('en', { type: 'bp', context: null, value1: 150, value2: 95 })
  expect(en).toContain('150'); expect(en).toContain('95'); expect(en.toLowerCase()).toContain('outside')
  expect(en).not.toMatch(/should|recommend|please|doctor|insulin|medicine|call/i)
  const ar = readingAlertText('ar', { type: 'sugar', context: 'fasting', value1: 210 })
  expect(ar).toContain('210')
  expect(ar).not.toMatch(/يجب|ينصح|الطبيب|اتصل|دواء/)
})
it('appointment text includes time, hospital and doctor', () => {
  for (const lang of ['ar', 'en'] as const) {
    for (const when of ['day_before', 'day_of'] as const) {
      const t = appointmentText(lang, when, '10:30', 'King Fahd', 'Dr Sara')
      expect(t).toContain('10:30'); expect(t).toContain('King Fahd'); expect(t).toContain('Dr Sara')
    }
  }
  expect(appointmentText('en', 'day_of', '10:30', null, null)).toContain('10:30')
})
