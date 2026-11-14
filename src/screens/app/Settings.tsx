import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { isValidUsername } from '@shared/login'
import ErrorRetry from '../../components/ErrorRetry'
import { parseNumber } from '@shared/numbers'
import { createMember, getMyTelegram, listMembers, listRanges, saveRange, updateHousehold } from '../../lib/api'
import NotifyButton from '../../components/NotifyButton'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import type { Member, RangeKey, Role } from '../../lib/types'
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


const RANGE_KEYS: RangeKey[] = ['sugar_fasting', 'sugar_after_meal', 'sugar_other', 'bp_systolic', 'bp_diastolic', 'temp']

function Ranges() {
  const { t } = useTranslation()
  const [vals, setVals] = useState<Record<string, { low: string; high: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    listRanges().then((rs) => setVals(Object.fromEntries(rs.map((r) => [r.key, { low: String(r.low), high: String(r.high) }])))).catch(() => setError(t('common.error')))
  }, [t])

  const set = (key: string, part: 'low' | 'high', v: string) => setVals((x) => ({ ...x, [key]: { ...(x[key] ?? { low: '', high: '' }), [part]: v } }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null); setSaved(false)
    const todo: [RangeKey, number, number][] = []
    for (const key of RANGE_KEYS) {
      const v = vals[key]
      if (!v || (!v.low.trim() && !v.high.trim())) continue
      const low = parseNumber(v.low), high = parseNumber(v.high)
      if (low === null || high === null) return setError(t('ranges.errNumber'))
      if (low >= high) return setError(t('ranges.errOrder'))
      todo.push([key, low, high])
    }
    try { for (const [k, l, h] of todo) await saveRange(k, l, h); setSaved(true) } catch { setError(t('common.error')) }
  }

  return (
    <section>
      <h2>{t('ranges.title')}</h2>
      <p className="muted">{t('ranges.hint')}</p>
      <form onSubmit={submit}>
        {RANGE_KEYS.map((key) => {
          const label = t(`ranges.name.${key}`)
          return (
            <div key={key} className="row">
              <strong>{label}</strong>
              <input aria-label={t('ranges.low', { label })} inputMode="decimal" value={vals[key]?.low ?? ''} onChange={(e) => set(key, 'low', e.target.value)} />
              <input aria-label={t('ranges.high', { label })} inputMode="decimal" value={vals[key]?.high ?? ''} onChange={(e) => set(key, 'high', e.target.value)} />
            </div>
          )
        })}
        {error && <p role="alert" className="error">{error}</p>}
        {saved && <p role="status">{t('ranges.saved')}</p>}
        <button type="submit">{t('ranges.save')}</button>
      </form>
    </section>
  )
}

function Wait() {
  const { t } = useTranslation()
  const { household, refresh } = useAuth()
  const [v, setV] = useState(String(household?.missed_wait_minutes ?? 30))
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const n = parseNumber(v)
    if (n === null || !Number.isInteger(n) || n < 5 || n > 240) return setError(t('wait.err'))
    try { await updateHousehold({ missed_wait_minutes: n }); await refresh() } catch { setError(t('common.error')) }
  }
  return (
    <section>
      <form onSubmit={submit}>
        <label>{t('wait.label')}<input inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit">{t('wait.save')}</button>
      </form>
    </section>
  )
}

function Telegram() {
  const { t } = useTranslation()
  const bot = import.meta.env.VITE_TELEGRAM_BOT as string | undefined
  const [me, setMe] = useState<{ telegram_chat_id: number | null; telegram_link_code: string } | null>(null)
  useEffect(() => { getMyTelegram().then(setMe).catch(() => undefined) }, [])
  return (
    <section>
      <h2>Telegram</h2>
      {me?.telegram_chat_id ? <p role="status">✓ {t('telegram.connected')}</p>
        : bot && me ? <a href={`https://t.me/${bot}?start=${me.telegram_link_code}`} target="_blank" rel="noreferrer">{t('telegram.connect')}</a>
        : <p className="muted">{t('telegram.notReady')}</p>}
    </section>
  )
}

export default function Settings() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  return (
    <div>
      <h1>{t('tabs.settings')}</h1>
      <section><h2>{t('notify.title')}</h2><NotifyButton /><p><Link to="/setup">{t('notify.setupGuide')}</Link></p></section>
      {profile?.role === 'family' && <Telegram />}
      {profile?.role === 'family' && <Members />}
      {profile?.role === 'family' && <Ranges />}
      {profile?.role === 'family' && <Wait />}
      <button type="button" onClick={() => void signOut()}>{t('auth.signOut')}</button>
    </div>
  )
}
