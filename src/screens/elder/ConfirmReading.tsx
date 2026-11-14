import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseNumber } from '@shared/numbers'
import { validateReading } from '@shared/ranges'
import BigButton from '../../components/BigButton'
import ErrorRetry from '../../components/ErrorRetry'
import StoredPhoto from '../../components/StoredPhoto'
import { addReading } from '../../lib/api'
import type { ReadingType, SugarContext } from '../../lib/types'

interface Props {
  type: ReadingType
  context: SugarContext | null
  initial?: { value1?: number; value2?: number; pulse?: number }
  source: 'typed' | 'photo'
  photoPath?: string | null
  unsure?: boolean
  onSaved: () => void
}

/** Number entry -> big confirm screen -> saved. Nothing is stored until the user taps Save. */
export default function ConfirmReading({ type, context, initial, source, photoPath, unsure, onSaved }: Props) {
  const { t } = useTranslation()
  const id = useRef(crypto.randomUUID()).current // same id on retry, so a double save cannot duplicate
  const [step, setStep] = useState<'input' | 'confirm' | 'saved'>('input')
  const [v1, setV1] = useState(initial?.value1 !== undefined ? String(initial.value1) : '')
  const [v2, setV2] = useState(initial?.value2 !== undefined ? String(initial.value2) : '')
  const [pulse, setPulse] = useState(initial?.pulse !== undefined ? String(initial.pulse) : '')
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outOfRange, setOutOfRange] = useState(false)

  const n1 = parseNumber(v1)
  const n2 = parseNumber(v2)
  const nPulse = pulse.trim() ? parseNumber(pulse) : null

  function next() {
    setError(null)
    if (n1 === null || (type === 'bp' && n2 === null) || (pulse.trim() && nPulse === null)) return setError(t('reading.errNumber'))
    if (validateReading(type, n1, n2) !== 'ok' || (nPulse !== null && (nPulse < 20 || nPulse > 250))) return setError(t('reading.errImplausible'))
    setStep('confirm')
  }

  async function save() {
    setBusy(true)
    setFailed(false)
    try {
      const r = await addReading({
        id, type, context, value1: n1!, value2: type === 'bp' ? n2 : null, pulse: type === 'bp' ? nPulse : null,
        photo_path: photoPath ?? null, source,
      })
      setOutOfRange(r.out_of_range)
      setStep('saved')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (step === 'saved') {
    return (
      <main className="elder">
        <p className="done">✓ {t('reading.saved')}</p>
        {outOfRange && <p role="status" className="warn">{t('reading.outOfRange')}</p>}
        <BigButton label={t('common.done')} onClick={onSaved} />
      </main>
    )
  }

  if (step === 'confirm') {
    const shown = type === 'bp' ? `${n1}/${n2}` : String(n1)
    return (
      <main className="elder">
        <h1>{t('reading.isThisRight')}</h1>
        <div className="big-number" data-testid="confirm-value">{shown}</div>
        <p className="muted">{t(`reading.unit.${type}`)}</p>
        {failed ? <ErrorRetry message={t('elder.saveFailed')} onRetry={() => void save()} /> : (
          <>
            <BigButton label={t('common.save')} onClick={() => void save()} disabled={busy} />
            <BigButton label={t('reading.change')} variant="secondary" onClick={() => setStep('input')} />
          </>
        )}
      </main>
    )
  }

  return (
    <main className="elder">
      {photoPath && <StoredPhoto path={photoPath} alt="" size={200} />}
      {source === 'photo' && <p className={unsure ? 'error' : 'muted'}>{t('reading.checkMatches')}</p>}
      <label>{t(`reading.label.${type === 'bp' ? 'bp1' : type}`)}
        <input inputMode="decimal" value={v1} onChange={(e) => setV1(e.target.value)} autoComplete="off" />
      </label>
      {type === 'bp' && (
        <>
          <label>{t('reading.label.bp2')}<input inputMode="decimal" value={v2} onChange={(e) => setV2(e.target.value)} autoComplete="off" /></label>
          <label>{t('reading.label.pulse')}<input inputMode="decimal" value={pulse} onChange={(e) => setPulse(e.target.value)} autoComplete="off" /></label>
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <BigButton label={t('common.next')} onClick={next} />
    </main>
  )
}
