import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import ErrorRetry from '../../components/ErrorRetry'
import ReadingChart from '../../components/ReadingChart'
import { deleteReading, listRanges, listReadings } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Range, Reading, ReadingType } from '../../lib/types'

const TYPES: ReadingType[] = ['sugar', 'bp', 'temp']
const CONTEXTS = ['all', 'fasting', 'after_meal', 'other'] as const

export default function Readings() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [type, setType] = useState<ReadingType>('sugar')
  const [ctx, setCtx] = useState<(typeof CONTEXTS)[number]>('all')
  const [readings, setReadings] = useState<Reading[] | null>(null)
  const [ranges, setRanges] = useState<Range[]>([])
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    setReadings(null)
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    Promise.all([listReadings(type, since), listRanges()])
      .then(([r, g]) => { setReadings(r); setRanges(g) })
      .catch(() => setError(true))
  }, [type])
  useEffect(load, [load])

  const shown = (readings ?? []).filter((r) => type !== 'sugar' || ctx === 'all' || r.context === ctx)
  const value = (r: Reading) => (r.type === 'bp' ? `${r.value1}/${r.value2}` : String(r.value1))

  async function remove(r: Reading) {
    if (!window.confirm(t('reading.confirmDelete'))) return
    try { await deleteReading(r.id); load() } catch { setError(true) }
  }

  return (
    <div>
      <h1>{t('tabs.readings')}</h1>
      <button type="button" onClick={() => navigate('/add-reading')}>{t('elder.addReading')}</button>
      <div role="tablist">
        {TYPES.map((x) => (
          <button key={x} role="tab" aria-selected={x === type} onClick={() => setType(x)}>{t(`reading.type.${x}`)}</button>
        ))}
      </div>
      {type === 'sugar' && (
        <div className="chips">
          {CONTEXTS.map((c) => (
            <button key={c} type="button" aria-pressed={c === ctx} onClick={() => setCtx(c)}>{t(c === 'all' ? 'reading.all' : `reading.ctx.${c}`)}</button>
          ))}
        </div>
      )}
      {error && <ErrorRetry message={t('common.error')} onRetry={load} />}
      {readings && shown.length === 0 && <p>{t('reading.none')}</p>}
      {readings && shown.length > 0 && <ReadingChart type={type} readings={shown} ranges={ranges} context={ctx === 'all' ? null : ctx} />}
      <ul className="readings">
        {shown.map((r) => (
          <li key={r.id}>
            <strong>{value(r)}</strong> {t(`reading.unit.${r.type}`)}
            {r.context && <> · {t(`reading.ctx.${r.context}`)}</>}
            {r.out_of_range && <span role="img" aria-label={t('reading.outside')}> ⚠</span>}
            <div className="muted">{new Date(r.taken_at).toLocaleString(i18n.language)}{r.source === 'photo' ? ` · ${t('reading.fromPhoto')}` : ''}</div>
            {profile?.role === 'family' && <button type="button" onClick={() => void remove(r)}>{t('common.delete')}</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}
