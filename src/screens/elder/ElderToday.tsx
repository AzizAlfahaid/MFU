import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { formatTime } from '@shared/time'
import AppointmentCard from '../../components/AppointmentCard'
import BigButton from '../../components/BigButton'
import ErrorRetry from '../../components/ErrorRetry'
import NotifyButton from '../../components/NotifyButton'
import { isUnlocked, unlock } from '../../lib/sound'
import { useAppointments } from '../../lib/useAppointments'
import { useTodayDoses } from '../../lib/useDoses'
import type { Lang } from '../../i18n'

/** The elder's main screen: what is next, today's appointments, and one big button to add a reading. */
export default function ElderToday() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { next, error: loadError, loaded, reload, tz } = useTodayDoses()
  const appts = useAppointments()
  const [soundOn, setSoundOn] = useState(isUnlocked())

  return (
    <main className="elder">
      <h1>{t('elder.today')}</h1>
      {loadError && <ErrorRetry message={t('elder.loadFailed')} onRetry={() => void reload()} />}
      <NotifyButton big />
      {!soundOn && <BigButton label={t('elder.soundOn')} variant="secondary" onClick={() => void unlock().then(() => setSoundOn(isUnlocked()))} />}
      {loaded && (
        <p>{next ? `${t('elder.nextMedicine')}: ${formatTime(next.scheduled_at, tz, i18n.language as Lang)}` : t('elder.noMoreToday')}</p>
      )}
      {appts.today.map((a) => <AppointmentCard key={a.id} appt={a} tz={tz} when="today" />)}
      {appts.tomorrow.map((a) => <AppointmentCard key={a.id} appt={a} tz={tz} when="tomorrow" />)}
      <BigButton label={t('elder.addReading')} onClick={() => navigate('/add-reading')} />
    </main>
  )
}
