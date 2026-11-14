import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import ErrorRetry from '../../components/ErrorRetry'
import SlotCard from '../../components/SlotCard'
import { markSlotTaken } from '../../lib/api'
import { useTodayDoses } from '../../lib/useDoses'

export default function Today() {
  const { t } = useTranslation()
  const { todaySlots, loaded, error, reload, markTakenLocally, tz } = useTodayDoses()
  const [failed, setFailed] = useState(false)

  async function taken(slotIso: string) {
    setFailed(false)
    try {
      await markSlotTaken(slotIso)
      markTakenLocally(slotIso)
    } catch { setFailed(true) }
  }

  return (
    <div>
      <h1>{t('tabs.today')}</h1>
      {(error || failed) && <ErrorRetry message={t('elder.loadFailed')} onRetry={() => { setFailed(false); void reload() }} />}
      {loaded && todaySlots.length === 0 && <p>{t('today.none')}</p>}
      <ul className="slots">
        {todaySlots.map((s) => <SlotCard key={s.scheduled_at} slot={s} tz={tz} canMark onTaken={() => void taken(s.scheduled_at)} />)}
      </ul>
    </div>
  )
}
