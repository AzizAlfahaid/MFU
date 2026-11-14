import { useCallback, useEffect, useState } from 'react'
import { addDays, localDate } from '@shared/time'
import { listAppointments, type AppointmentWithHospital } from './api'
import { useAuth } from './auth'

/** Appointments that are still ahead today, and tomorrow's. */
export function useAppointments() {
  const { household } = useAuth()
  const tz = household?.timezone ?? 'Asia/Riyadh'
  const [all, setAll] = useState<AppointmentWithHospital[]>([])

  const load = useCallback(() => {
    listAppointments(new Date(Date.now() - 3_600_000).toISOString()).then(setAll).catch(() => undefined)
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('focus', load)
    const id = setInterval(load, 5 * 60_000)
    return () => { window.removeEventListener('focus', load); clearInterval(id) }
  }, [load])

  const today = localDate(new Date(), tz)
  const tomorrow = addDays(today, 1)
  const on = (d: string) => all.filter((a) => localDate(new Date(a.starts_at), tz) === d)
  return { today: on(today), tomorrow: on(tomorrow), tz }
}
