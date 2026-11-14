import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { localDate, localTime, zonedToUtc } from '@shared/time'
import ErrorRetry from '../../components/ErrorRetry'
import { listHospitals, saveAppointment, type AppointmentWithHospital } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import type { Hospital } from '../../lib/types'

export default function AppointmentForm({ initial, onSaved, onCancel }: {
  initial?: AppointmentWithHospital; onSaved: () => void; onCancel: () => void
}) {
  const { t } = useTranslation()
  const { household } = useAuth()
  const tz = household?.timezone ?? 'Asia/Riyadh'
  const start = initial ? new Date(initial.starts_at) : null
  const [date, setDate] = useState(start ? localDate(start, tz) : '')
  const [time, setTime] = useState(start ? localTime(initial!.starts_at, tz) : '')
  const [hospital, setHospital] = useState(initial?.hospital ?? '')
  const [doctor, setDoctor] = useState(initial?.doctor ?? '')
  const [purpose, setPurpose] = useState(initial?.purpose ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [hospitals, setHospitals] = useState<Hospital[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { listHospitals().then(setHospitals).catch(() => undefined) }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!date || !time) return setError(t('appointments.errDateTime'))
    setBusy(true)
    try {
      await saveAppointment({
        id: initial?.id, starts_at: zonedToUtc(date, `${time}:00`, tz).toISOString(),
        hospital_name: hospital, doctor, purpose, notes,
      })
      onSaved()
    } catch {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h2>{initial ? t('appointments.edit') : t('appointments.add')}</h2>
      <label>{t('appointments.date')}<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>{t('appointments.time')}<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      <label>{t('appointments.hospital')}
        <input list="hospitals" value={hospital} onChange={(e) => setHospital(e.target.value)} />
        <datalist id="hospitals">{hospitals.map((h) => <option key={h.id} value={h.name} />)}</datalist>
      </label>
      <label>{t('appointments.doctor')}<input value={doctor} onChange={(e) => setDoctor(e.target.value)} /></label>
      <label>{t('appointments.purpose')}<input value={purpose} onChange={(e) => setPurpose(e.target.value)} /></label>
      <label>{t('appointments.notes')}<input value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {error && <ErrorRetry message={error} />}
      <button type="submit" disabled={busy}>{t('common.save')}</button>
      <button type="button" onClick={onCancel}>{t('common.cancel')}</button>
    </form>
  )
}
