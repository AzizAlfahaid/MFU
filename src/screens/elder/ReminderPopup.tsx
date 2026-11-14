import { useTranslation } from 'react-i18next'
import { formatTime } from '@shared/time'
import type { Slot } from '@shared/types'
import BigButton from '../../components/BigButton'
import ErrorRetry from '../../components/ErrorRetry'
import StoredPhoto from '../../components/StoredPhoto'
import type { EnrichedDose } from '../../lib/api'
import type { Lang } from '../../i18n'

export default function ReminderPopup({ slot, tz, busy, error, soundOn, onEnableSound, onTaken }: {
  slot: Slot<EnrichedDose>; tz: string; busy: boolean; error: boolean; soundOn: boolean; onEnableSound: () => void; onTaken: () => void
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="popup elder" role="dialog" aria-modal="true" aria-label={t('elder.medicineTime')}>
      <h1>{t('elder.medicineTime')} — {formatTime(slot.scheduled_at, tz, i18n.language as Lang)}</h1>
      {slot.doses.map((d) => (
        <section key={d.id} className="popup-med">
          <StoredPhoto path={d.photo_path} alt={d.name} size={200} />
          <h2>{d.name}</h2>
          <p>{d.dose}</p>
          {d.notes && <p className="muted">{d.notes}</p>}
        </section>
      ))}
      {!soundOn && <BigButton label={t('elder.soundOn')} variant="secondary" onClick={onEnableSound} />}
      {error && <ErrorRetry message={t('elder.saveFailed')} onRetry={onTaken} />}
      {!error && <BigButton label={t('common.taken')} onClick={onTaken} disabled={busy} />}
    </div>
  )
}
