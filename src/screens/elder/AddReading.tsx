import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import BigButton from '../../components/BigButton'
import type { ReadingType, SugarContext } from '../../lib/types'
import ConfirmReading from './ConfirmReading'

export { ConfirmReading }

export default function AddReading() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [type, setType] = useState<ReadingType | null>(null)
  const [context, setContext] = useState<SugarContext | null>(null)

  const back = () => (context ? setContext(null) : setType(null))

  if (!type) {
    return (
      <main className="elder">
        <h1>{t('reading.whatToAdd')}</h1>
        <BigButton label={t('reading.type.sugar')} onClick={() => setType('sugar')} />
        <BigButton label={t('reading.type.bp')} onClick={() => setType('bp')} />
        <BigButton label={t('reading.type.temp')} onClick={() => setType('temp')} />
        <BigButton label={t('common.back')} variant="secondary" onClick={() => navigate('/')} />
      </main>
    )
  }

  if (type === 'sugar' && !context) {
    return (
      <main className="elder">
        <h1>{t('reading.whenSugar')}</h1>
        <BigButton label={t('reading.ctx.fasting')} onClick={() => setContext('fasting')} />
        <BigButton label={t('reading.ctx.after_meal')} onClick={() => setContext('after_meal')} />
        <BigButton label={t('reading.ctx.other')} onClick={() => setContext('other')} />
        <BigButton label={t('common.back')} variant="secondary" onClick={back} />
      </main>
    )
  }

  return <ConfirmReading type={type} context={context} source="typed" onSaved={() => navigate('/')} />
}
