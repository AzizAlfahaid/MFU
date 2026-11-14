import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import App from '../src/App'
import { setLanguage } from '../src/i18n'
import ar from '../src/i18n/ar.json'
import en from '../src/i18n/en.json'

const flatKeys = (o: Record<string, unknown>, p = ''): string[] =>
  Object.entries(o)
    .flatMap(([k, v]) =>
      typeof v === 'object' && v !== null ? flatKeys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`],
    )
    .sort()

beforeEach(() => {
  localStorage.clear()
  setLanguage('ar')
})

it('defaults to Arabic RTL', () => {
  render(<App />)
  expect(document.documentElement.dir).toBe('rtl')
  expect(document.documentElement.lang).toBe('ar')
})

it('switches to English LTR and remembers it', async () => {
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: 'English' }))
  expect(document.documentElement.dir).toBe('ltr')
  expect(localStorage.getItem('mfu.lang')).toBe('en')
})

it('ar.json and en.json have identical key sets', () => {
  expect(flatKeys(ar)).toEqual(flatKeys(en))
})
