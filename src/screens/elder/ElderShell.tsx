import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { armAutoUnlock } from '../../lib/sound'
import ReminderOverlay from './ReminderOverlay'

export default function ElderShell() {
  useEffect(() => armAutoUnlock(), [])
  return (
    <>
      <ReminderOverlay />
      <Outlet />
    </>
  )
}
