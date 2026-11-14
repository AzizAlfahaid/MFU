import { useTranslation } from 'react-i18next'
import { formatTime } from '@shared/time'
import type { Slot } from '@shared/types'
import type { EnrichedDose } from '../lib/api'
import type { Lang } from '../i18n'
import BigButton from './BigButton'

export default function SlotCard({ slot, tz, canMark, onTaken }: {
  slot: Slot<EnrichedDose>; tz: string; canMark: boolean; onTaken: () => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <li className="slot">
      <strong>{formatTime(slot.scheduled_at, tz, i18n.language as Lang)}</strong>
      <ul>
        {slot.doses.map((d) => (
          <li key={d.id}>{d.name} — {d.dose} <span className={`badge ${d.status}`}>{t(`status.${d.status}`)}</span></li>
        ))}
      </ul>
      {canMark && <BigButton label={t('common.taken')} onClick={onTaken} />}
    </li>
  )
}
