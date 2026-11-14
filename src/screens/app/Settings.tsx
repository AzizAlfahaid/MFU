import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { isValidUsername } from '@shared/login'
import ErrorRetry from '../../components/ErrorRetry'
import { createMember, listMembers } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Member, Role } from '../../lib/types'
import type { Lang } from '../../i18n'

function Members() {
  const { t } = useTranslation()
  const [members, setMembers] = useState<Member[]>([])
  const [loadError, setLoadError] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('elder')
  const [lang, setLang] = useState<Lang>('ar')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const load = useCallback(() => {
    setLoadError(false)
    listMembers().then(setMembers).catch(() => setLoadError(true))
  }, [])
  useEffect(load, [load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(false)
    if (password.length < 8) return setError(t('settings.passwordShort'))
    if (!isValidUsername(username)) return setError(t('settings.usernameInvalid'))
    try {
      await createMember({ display_name: name.trim(), role, username: username.trim(), password, lang })
      setName(''); setUsername(''); setPassword(''); setDone(true)
      load()
    } catch (err) {
      const code = (err as Error).message
      setError(code === 'username_taken' ? t('settings.usernameTaken') : t('common.error'))
    }
  }

  return (
    <section>
      <h2>{t('settings.members')}</h2>
      {loadError && <ErrorRetry message={t('common.error')} onRetry={load} />}
      <ul>{members.map((m) => <li key={m.id}>{m.display_name} — {t(`roles.${m.role}`)}</li>)}</ul>
      <form onSubmit={submit}>
        <label>{t('settings.name')}<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>{t('settings.role')}
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {(['elder', 'helper', 'family'] as const).map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
          </select>
        </label>
        <label>{t('settings.language')}
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>{t('settings.username')}<input value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" required /></label>
        <label>{t('settings.password')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p role="alert" className="error">{error}</p>}
        {done && <p role="status">{t('settings.memberAdded')}</p>}
        <button type="submit">{t('settings.addMember')}</button>
      </form>
    </section>
  )
}

export default function Settings() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  return (
    <div>
      <h1>{t('tabs.settings')}</h1>
      {profile?.role === 'family' && <Members />}
      <button type="button" onClick={() => void signOut()}>{t('auth.signOut')}</button>
    </div>
  )
}
