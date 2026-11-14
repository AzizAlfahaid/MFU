import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import LanguageSwitch from '../components/LanguageSwitch'
import ErrorRetry from '../components/ErrorRetry'
import { createHousehold } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function Onboarding() {
  const { t } = useTranslation()
  const { refresh, signOut } = useAuth()
  const [name, setName] = useState('')
  const [me, setMe] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    setError(false)
    setBusy(true)
    try {
      await createHousehold(name.trim(), me.trim())
      await refresh()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="elder">
      <LanguageSwitch />
      <h1>{t('onboarding.title')}</h1>
      <form onSubmit={submit}>
        <label>{t('onboarding.householdName')}
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>{t('onboarding.yourName')}
          <input value={me} onChange={(e) => setMe(e.target.value)} required />
        </label>
        <button type="submit" className="big-button primary" disabled={busy}>{t('onboarding.create')}</button>
      </form>
      {error && <ErrorRetry message={t('common.error')} onRetry={() => void submit()} />}
      <button type="button" className="link" onClick={() => void signOut()}>{t('auth.signOut')}</button>
    </main>
  )
}
