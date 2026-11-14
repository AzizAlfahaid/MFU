import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { markSlotTaken } from '../../lib/api'
import { isUnlocked, startAlarm, stopAlarm, unlock } from '../../lib/sound'
import { useTodayDoses } from '../../lib/useDoses'
import ReminderPopup from './ReminderPopup'

/** The full-screen medicine popup. Lives above every elder screen so it can never be missed. */
export default function ReminderOverlay() {
  const { t } = useTranslation()
  const { active, reload, markTakenLocally, tz } = useTodayDoses()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [done, setDone] = useState(false)
  const [soundOn, setSoundOn] = useState(isUnlocked())
  const doneTimer = useRef<ReturnType<typeof setTimeout>>()

  const alarmSlot = active?.doses.some((d) => d.status === 'pending') ? active.scheduled_at : null
  useEffect(() => {
    if (!alarmSlot) return stopAlarm()
    startAlarm()
    return stopAlarm
  }, [alarmSlot, soundOn])
  useEffect(() => () => clearTimeout(doneTimer.current), [])

  async function taken() {
    if (!active) return
    setBusy(true)
    setFailed(false)
    try {
      const changed = await markSlotTaken(active.scheduled_at)
      if (changed === 0) return void (await reload()) // nothing changed on the server: show the truth, no tick
      markTakenLocally(active.scheduled_at)
      stopAlarm()
      setDone(true)
      doneTimer.current = setTimeout(() => setDone(false), 2000)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {done && <p role="status" className="done toast">✓ {t('elder.done')}</p>}
      {active && (
        <ReminderPopup
          slot={active} tz={tz} busy={busy} error={failed} soundOn={soundOn}
          onEnableSound={() => void unlock().then(() => setSoundOn(isUnlocked()))}
          onTaken={() => void taken()}
        />
      )}
    </>
  )
}
