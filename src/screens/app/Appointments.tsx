import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ErrorRetry from '../../components/ErrorRetry'
import { deleteAppointment, listAppointments, type AppointmentWithHospital } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Lang } from '../../i18n'
import AppointmentForm from './AppointmentForm'

export default function Appointments() {
  const { t, i18n } = useTranslation()
  const { profile, household } = useAuth()
  const tz = household?.timezone ?? 'Asia/Riyadh'
  const isFamily = profile?.role === 'family'
  const [appts, setAppts] = useState<AppointmentWithHospital[] | null>(null)
  const [error, setError] = useState(false)
  const [editing, setEditing] = useState<AppointmentWithHospital | 'new' | null>(null)

  const load = useCallback(() => {
    setError(false)
    listAppointments(new Date(Date.now() - 90 * 86_400_000).toISOString()).then(setAppts).catch(() => setError(true))
  }, [])
  useEffect(load, [load])

  async function remove(a: AppointmentWithHospital) {
    if (!window.confirm(t('appointments.confirmDelete'))) return
    try { await deleteAppointment(a.id); load() } catch { setError(true) }
  }

  if (editing) {
    return <AppointmentForm initial={editing === 'new' ? undefined : editing} onSaved={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
  }

  const now = Date.now()
  const upcoming = (appts ?? []).filter((a) => new Date(a.starts_at).getTime() >= now)
  const past = (appts ?? []).filter((a) => new Date(a.starts_at).getTime() < now).reverse()
  const fmt = (iso: string) => new Intl.DateTimeFormat(i18n.language as Lang, { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

  const row = (a: AppointmentWithHospital) => (
    <li key={a.id}>
      <strong>{fmt(a.starts_at)}</strong>
      <div>{[a.hospital, a.doctor].filter(Boolean).join(' — ')}</div>
      {a.purpose && <div>{a.purpose}</div>}
      {a.notes && <div className="muted">{a.notes}</div>}
      {isFamily && (
        <>
          <button type="button" onClick={() => setEditing(a)}>{t('common.edit')}</button>
          <button type="button" onClick={() => void remove(a)}>{t('common.delete')}</button>
        </>
      )}
    </li>
  )

  return (
    <div>
      <h1>{t('tabs.appointments')}</h1>
      {isFamily && <button type="button" onClick={() => setEditing('new')}>{t('appointments.add')}</button>}
      {error && <ErrorRetry message={t('common.error')} onRetry={load} />}
      {appts && upcoming.length === 0 && <p>{t('appointments.none')}</p>}
      <ul className="cards">{upcoming.map(row)}</ul>
      {past.length > 0 && (
        <details>
          <summary>{t('appointments.past')}</summary>
          <ul className="cards">{past.map(row)}</ul>
        </details>
      )}
    </div>
  )
}
