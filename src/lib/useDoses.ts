import { useCallback, useEffect, useMemo, useState } from 'react'
import { activeSlot, groupBySlot } from '@shared/schedule'
import { addDays, localDate, zonedToUtc } from '@shared/time'
import { listDoses, subscribeDoses, type EnrichedDose } from './api'
import { useAuth } from './auth'

export function useNow(everyMs = 15_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

/** Yesterday + today's doses, kept fresh (30 s poll, on focus, and live changes). */
export function useTodayDoses() {
  const { household } = useAuth()
  const tz = household?.timezone ?? 'Asia/Riyadh'
  const now = useNow()
  const [doses, setDoses] = useState<EnrichedDose[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const reload = useCallback(async () => {
    const d = localDate(new Date(), tz)
    try {
      setDoses(await listDoses(zonedToUtc(addDays(d, -1), '00:00:00', tz).toISOString(), zonedToUtc(addDays(d, 1), '00:00:00', tz).toISOString()))
      setError(false)
      setLoaded(true)
    } catch {
      setError(true)
    }
  }, [tz])

  useEffect(() => {
    void reload()
    const id = setInterval(() => void reload(), 30_000)
    const onFocus = () => void reload()
    window.addEventListener('focus', onFocus)
    const off = subscribeDoses(() => void reload())
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); off() }
  }, [reload])

  /** Mark a slot's pending/missed doses as taken on screen right away (server is the truth on next refresh). */
  const markTakenLocally = useCallback((slotIso: string) => {
    const t = new Date(slotIso).getTime()
    setDoses((ds) => ds.map((d) => (new Date(d.scheduled_at).getTime() === t && (d.status === 'pending' || d.status === 'missed')
      ? { ...d, status: d.status === 'pending' ? 'taken' : 'taken_late' } : d)))
  }, [])

  const today = localDate(now, tz)
  const todaySlots = useMemo(
    () => groupBySlot(doses.filter((d) => localDate(new Date(d.scheduled_at), tz) === today)),
    [doses, tz, today],
  )
  const active = useMemo(() => activeSlot(doses, now), [doses, now])
  const next = useMemo(
    () => todaySlots.find((s) => new Date(s.scheduled_at) > now && s.doses.some((d) => d.status === 'pending')) ?? null,
    [todaySlots, now],
  )
  return { doses, todaySlots, active, next, loaded, error, reload, markTakenLocally, tz, now }
}
