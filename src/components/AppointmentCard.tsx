import { useTranslation } from 'react-i18next'
import { formatTime } from '@shared/time'
import type { AppointmentWithHospital } from '../lib/api'
import type { Lang } from '../i18n'

export default function AppointmentCard({ appt, tz, when }: { appt: AppointmentWithHospital; tz: string; when: 'today' | 'tomorrow' }) {
  const { t, i18n } = useTranslation()
  return (
    <section className="appt-card">
      <h2>{t(`appointments.${when}`)}</h2>
      <p><strong>{formatTime(appt.starts_at, tz, i18n.language as Lang)}</strong></p>
      {appt.hospital && <p>{appt.hospital}</p>}
      {appt.doctor && <p>{appt.doctor}</p>}
      {appt.purpose && <p className="muted">{appt.purpose}</p>}
    </section>
  )
}
