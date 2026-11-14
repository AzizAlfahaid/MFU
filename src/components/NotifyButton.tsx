import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { enablePush, pushIsOn, type PushResult } from '../lib/push'
import BigButton from './BigButton'

/** "Turn on notifications" with a plain-language result. Hidden once notifications are on. */
export default function NotifyButton({ big = false }: { big?: boolean }) {
  const { t } = useTranslation()
  const [on, setOn] = useState<boolean | null>(null)
  const [result, setResult] = useState<PushResult | 'failed' | null>(null)
  useEffect(() => { void pushIsOn().then(setOn) }, [])

  async function go() {
    try {
      const r = await enablePush()
      setResult(r)
      if (r === 'enabled') setOn(true)
    } catch {
      setResult('failed')
    }
  }

  if (on !== false) return on ? (big ? null : <p role="status">✓ {t('notify.on')}</p>) : null
  return (
    <div>
      {big ? <BigButton label={t('notify.turnOn')} onClick={() => void go()} /> : <button type="button" onClick={() => void go()}>{t('notify.turnOn')}</button>}
      {result && result !== 'enabled' && <p role="alert" className="error">{t(`notify.${result}`)} <Link to="/setup">{t('notify.setupGuide')}</Link></p>}
    </div>
  )
}
