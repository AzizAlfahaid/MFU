import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, formatTime, localDate, zonedToUtc } from '@shared/time'
import ErrorRetry from '../../components/ErrorRetry'
import { listDoses, type EnrichedDose } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Lang } from '../../i18n'

export default function History() {
  const { t, i18n } = useTranslation()
  const { household } = useAuth()
  const tz = household?.timezone ?? 'Asia/Riyadh'
  const [doses, setDoses] = useState<EnrichedDose[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    const today = localDate(new Date(), tz)
    listDoses(zonedToUtc(addDays(today, -29), '00:00:00', tz).toISOString(), zonedToUtc(addDays(today, 1), '00:00:00', tz).toISOString())
      .then(setDoses).catch(() => setError(true))
  }, [tz])
  useEffect(load, [load])

  const days = useMemo(() => {
    const map = new Map<string, EnrichedDose[]>()
    for (const d of doses ?? []) {
      const k = localDate(new Date(d.scheduled_at), tz)
      map.set(k, [...(map.get(k) ?? []), d])
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [doses, tz])

  return (
    <div>
      <h1>{t('tabs.history')}</h1>
      {error && <ErrorRetry message={t('common.error')} onRetry={load} />}
      {doses?.length === 0 && <p>{t('history.none')}</p>}
      {days.map(([day, ds]) => {
        const count = (s: string) => ds.filter((d) => d.status === s).length
        return (
          <section key={day} className="day">
            <h2>{day}</h2>
            <p className="muted">{t('history.summary', { taken: count('taken'), late: count('taken_late'), missed: count('missed') })}</p>
            <ul>
              {ds.map((d) => (
                <li key={d.id}>
                  {formatTime(d.scheduled_at, tz, i18n.language as Lang)} — {d.name} <span className={`badge ${d.status}`}>{t(`status.${d.status}`)}</span>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
