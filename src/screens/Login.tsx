import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSwitch from '../components/LanguageSwitch'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { t } = useTranslation()
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'in') await signIn(login, password)
      else {
        if (password.length < 8) throw new Error('weak')
        await signUp(login, password)
      }
    } catch (err) {
      setError(mode === 'in' ? t('auth.wrong') : (err as Error).message === 'weak' ? t('auth.weak') : t('auth.signUpFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="elder">
      <LanguageSwitch />
      <h1>{t('app.name')}</h1>
      <form onSubmit={submit}>
        <label>{mode === 'in' ? t('auth.login') : t('auth.email')}
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoCapitalize="none" autoComplete="username" required />
        </label>
        <label>{t('auth.password')}
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" className="big-button primary" disabled={busy}>{mode === 'in' ? t('auth.signIn') : t('auth.createAccount')}</button>
      </form>
      <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null) }}>
        {mode === 'in' ? t('auth.newFamily') : t('auth.haveAccount')}
      </button>
    </main>
  )
}
