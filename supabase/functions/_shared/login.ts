import type { Lang, Role } from './types.ts'

const DOMAIN = 'members.mfu.app'

/** Elder and helper sign in with a short username; it is stored as an email on a private domain. */
export function toEmail(login: string): string {
  const v = login.trim()
  return v.includes('@') ? v : `${v.toLowerCase()}@${DOMAIN}`
}

export function isValidUsername(u: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/i.test(u.trim())
}

export interface MemberInput { display_name: string; role: Role; username: string; password: string; lang: Lang }

export function validateMemberInput(body: unknown):
  | { ok: true; value: MemberInput }
  | { ok: false; error: 'invalid_input' | 'invalid_username' | 'weak_password' } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'invalid_input' }
  const b = body as Record<string, unknown>
  const display_name = typeof b.display_name === 'string' ? b.display_name.trim() : ''
  const role = b.role
  if (!display_name || (role !== 'elder' && role !== 'helper' && role !== 'family')) return { ok: false, error: 'invalid_input' }
  const lang: Lang = b.lang === 'en' ? 'en' : 'ar'
  const username = typeof b.username === 'string' ? b.username.trim() : ''
  if (!isValidUsername(username)) return { ok: false, error: 'invalid_username' }
  const password = typeof b.password === 'string' ? b.password : ''
  if (password.length < 8) return { ok: false, error: 'weak_password' }
  return { ok: true, value: { display_name, role, username, password, lang } }
}

export type ManageInput =
  | { action: 'remove'; id: string }
  | { action: 'reset_password'; id: string; password: string }
  | { action: 'set_lang'; id: string; lang: Lang }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateManageInput(body: unknown):
  | { ok: true; value: ManageInput }
  | { ok: false; error: 'invalid_input' | 'weak_password' } {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'invalid_input' }
  const b = body as Record<string, unknown>
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return { ok: false, error: 'invalid_input' }
  if (b.action === 'remove') return { ok: true, value: { action: 'remove', id: b.id } }
  if (b.action === 'reset_password') {
    if (typeof b.password !== 'string' || b.password.length < 8) return { ok: false, error: 'weak_password' }
    return { ok: true, value: { action: 'reset_password', id: b.id, password: b.password } }
  }
  if (b.action === 'set_lang' && (b.lang === 'ar' || b.lang === 'en')) return { ok: true, value: { action: 'set_lang', id: b.id, lang: b.lang } }
  return { ok: false, error: 'invalid_input' }
}
