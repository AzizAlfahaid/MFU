import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { MeterResult } from '@shared/types'
import BigButton from '../../components/BigButton'
import PhotoInput from '../../components/PhotoInput'
import { readMeter } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { uploadPhoto } from '../../lib/files'
import type { ReadingType, SugarContext } from '../../lib/types'
import ConfirmReading from './ConfirmReading'

export { ConfirmReading }

type Stage =
  | { name: 'method' }
  | { name: 'reading' }
  | { name: 'entry'; notice?: string; photoPath?: string; result?: Extract<MeterResult, { readable: true }> }

export default function AddReading() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { household } = useAuth()
  const [type, setType] = useState<ReadingType | null>(null)
  const [context, setContext] = useState<SugarContext | null>(null)
  const [stage, setStage] = useState<Stage>({ name: 'method' })

  const back = () => {
    setStage({ name: 'method' })
    if (context) setContext(null)
    else setType(null)
  }

  async function onPhoto(file: File) {
    if (!type) return
    setStage({ name: 'reading' })
    let path: string
    try {
      path = await uploadPhoto(household!.id, 'readings', file)
    } catch {
      return setStage({ name: 'entry', notice: t('reading.uploadFailed') })
    }
    const r = await readMeter(path, type)
    if (r.readable) setStage({ name: 'entry', photoPath: path, result: r })
    else setStage({ name: 'entry', photoPath: path, notice: t('reading.unreadable') })
  }

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

  if (stage.name === 'method') {
    return (
      <main className="elder">
        <h1>{t('reading.how')}</h1>
        <PhotoInput label={t('reading.takePhoto')} testId="photo-input-reading" onPick={(f) => void onPhoto(f)} />
        <BigButton label={t('reading.typeNumber')} variant="secondary" onClick={() => setStage({ name: 'entry' })} />
        <BigButton label={t('common.back')} variant="secondary" onClick={back} />
      </main>
    )
  }

  if (stage.name === 'reading') {
    return <main className="elder"><p role="status">{t('reading.reading')}</p></main>
  }

  const r = stage.result
  return (
    <>
      {stage.notice && <p role="status" className="warn elder">{stage.notice}</p>}
      <ConfirmReading
        type={type}
        context={context}
        initial={r ? { value1: r.value1, value2: r.value2, pulse: r.pulse } : undefined}
        source={r ? 'photo' : 'typed'}
        photoPath={stage.photoPath}
        unsure={r ? !r.confident : false}
        onSaved={() => navigate('/')}
      />
    </>
  )
}
