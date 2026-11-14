import { expect, it } from 'vitest'
import { isValidUsername, toEmail, validateMemberInput } from '@shared/login'

it('turns a short username into a sign-in email', () => {
  expect(toEmail('Mama')).toBe('mama@members.mfu.app')
  expect(toEmail('  Mama ')).toBe('mama@members.mfu.app')
})
it('keeps a real email as it is', () => expect(toEmail('a@b.com')).toBe('a@b.com'))
it('accepts simple usernames only', () => {
  expect(isValidUsername('mama')).toBe(true)
  expect(isValidUsername('nurse.sara-2')).toBe(true)
  expect(isValidUsername('أمي')).toBe(false)
  expect(isValidUsername('a b')).toBe(false)
  expect(isValidUsername('ab')).toBe(false)
  expect(isValidUsername('a@b.com')).toBe(false)
})
const ok = { display_name: 'Mama', role: 'elder', username: 'mama', password: 'longenough1' }
it('validates a new member', () => {
  expect(validateMemberInput(ok)).toEqual({ ok: true, value: { ...ok, lang: 'ar' } })
  expect(validateMemberInput({ ...ok, lang: 'en' })).toEqual({ ok: true, value: { ...ok, lang: 'en' } })
})
it('rejects bad members with a reason', () => {
  expect(validateMemberInput({ ...ok, password: 'short' })).toEqual({ ok: false, error: 'weak_password' })
  expect(validateMemberInput({ ...ok, username: 'a b' })).toEqual({ ok: false, error: 'invalid_username' })
  expect(validateMemberInput({ ...ok, role: 'admin' })).toEqual({ ok: false, error: 'invalid_input' })
  expect(validateMemberInput({ ...ok, display_name: '  ' })).toEqual({ ok: false, error: 'invalid_input' })
  expect(validateMemberInput(null)).toEqual({ ok: false, error: 'invalid_input' })
})
