import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { canMarkTaken } from '@shared/schedule'
import AppointmentCard from '../../components/AppointmentCard'
import ErrorRetry from '../../components/ErrorRetry'
import SlotCard from '../../components/SlotCard'
import { markSlotTaken } from '../../lib/api'
import { useAppointments } from '../../lib/useAppointments'
import { useTodayDoses } from '../../lib/useDoses'

export default function Today() {
  const { t } = useTranslation()
  const { todaySlots, doses, loaded, error, reload, markTakenLocally, tz, now } = useTodayDoses()
  const appts = useAppointments()
  const [problem, setProblem] = useState<{ slot: string; message: string } | null>(null)

  async function taken(slotIso: string) {
    setProblem(null)
    try {
      if ((await markSlotTaken(slotIso)) === 0) {
        setProblem({ slot: slotIso, message: t('today.notChanged') })
        return void (await reload())
      }
      markTakenLocally(slotIso)
    } catch {
      setProblem({ slot: slotIso, message: t('elder.saveFailed') })
    }
  }

  return (
    <div>
      <h1>{t('tabs.today')}</h1>
      {error && <ErrorRetry message={t('elder.loadFailed')} onRetry={() => void reload()} />}
      {problem && <ErrorRetry message={problem.message} onRetry={() => void taken(problem.slot)} />}
      {appts.today.map((a) => <AppointmentCard key={a.id} appt={a} tz={tz} when="today" />)}
      {appts.tomorrow.map((a) => <AppointmentCard key={a.id} appt={a} tz={tz} when="tomorrow" />)}
      {loaded && todaySlots.length === 0 && <p>{t('today.none')}</p>}
      <ul className="slots">
        {todaySlots.map((s) => (
          <SlotCard key={s.scheduled_at} slot={s} tz={tz} canMark={canMarkTaken(s.doses, doses, now)} onTaken={() => void taken(s.scheduled_at)} />
        ))}
      </ul>
    </div>
  )
}
