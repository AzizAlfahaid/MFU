import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { formatTime } from '@shared/time'
import BigButton from '../../components/BigButton'
import ErrorRetry from '../../components/ErrorRetry'
import { markSlotTaken } from '../../lib/api'
import { isUnlocked, startAlarm, stopAlarm, unlock } from '../../lib/sound'
import { useTodayDoses } from '../../lib/useDoses'
import type { Lang } from '../../i18n'
import ReminderPopup from './ReminderPopup'

export default function ElderToday() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { active, next, error: loadError, loaded, reload, markTakenLocally, tz } = useTodayDoses()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [done, setDone] = useState(false)
  const [soundOn, setSoundOn] = useState(isUnlocked())
  const doneTimer = useRef<ReturnType<typeof setTimeout>>()

  const alarmSlot = active?.doses.some((d) => d.status === 'pending') ? active.scheduled_at : null
  useEffect(() => {
    if (!alarmSlot) return stopAlarm()
    startAlarm()
    return stopAlarm
  }, [alarmSlot, soundOn])
  useEffect(() => () => clearTimeout(doneTimer.current), [])

  async function taken() {
    if (!active) return
    setBusy(true)
    setFailed(false)
    try {
      await markSlotTaken(active.scheduled_at)
      markTakenLocally(active.scheduled_at)
      stopAlarm()
      setDone(true)
      doneTimer.current = setTimeout(() => setDone(false), 2000)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (active) {
    return (
      <>
        {!soundOn && (
          <BigButton label={t('elder.soundOn')} onClick={() => void unlock().then(() => setSoundOn(isUnlocked()))} />
        )}
        <ReminderPopup slot={active} tz={tz} busy={busy} error={failed} onTaken={() => void taken()} />
      </>
    )
  }

  return (
    <main className="elder">
      <h1>{t('elder.today')}</h1>
      {done && <p role="status" className="done">✓ {t('elder.done')}</p>}
      {loadError && <ErrorRetry message={t('elder.loadFailed')} onRetry={() => void reload()} />}
      {!soundOn && <BigButton label={t('elder.soundOn')} variant="secondary" onClick={() => void unlock().then(() => setSoundOn(isUnlocked()))} />}
      {loaded && (
        <p>{next ? `${t('elder.nextMedicine')}: ${formatTime(next.scheduled_at, tz, i18n.language as Lang)}` : t('elder.noMoreToday')}</p>
      )}
      <BigButton label={t('elder.addReading')} onClick={() => navigate('/add-reading')} />
    </main>
  )
}
