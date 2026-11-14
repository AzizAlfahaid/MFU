import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

export default function SetupGuide() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const steps = ['homeScreen', 'openIcon', 'notifications', 'sound', ...(profile?.role === 'family' ? ['telegram'] : [])]
  return (
    <main className="elder">
      <h1>{t('setup.title')}</h1>
      <ol>{steps.map((s) => <li key={s}><strong>{t(`setup.${s}.title`)}</strong><br />{t(`setup.${s}.body`)}</li>)}</ol>
      <button type="button" onClick={() => navigate(-1)}>{t('common.back')}</button>
    </main>
  )
}
