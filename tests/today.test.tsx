import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localDate, zonedToUtc } from '@shared/time'
import { setLanguage } from '../src/i18n'

vi.mock('../src/lib/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../src/lib/files', () => ({ signedUrl: vi.fn().mockResolvedValue('https://signed/x') }))
vi.mock('../src/lib/sound', () => ({
  isUnlocked: vi.fn(() => true), unlock: vi.fn().mockResolvedValue(undefined), startAlarm: vi.fn(), stopAlarm: vi.fn(),
}))
vi.mock('../src/lib/api', () => ({
  listDoses: vi.fn(), markSlotTaken: vi.fn().mockResolvedValue(2), subscribeDoses: vi.fn(() => () => undefined),
  listAppointments: vi.fn().mockResolvedValue([]),
}))
import * as api from '../src/lib/api'
import { useAuth } from '../src/lib/auth'
import * as sound from '../src/lib/sound'
import ElderToday from '../src/screens/elder/ElderToday'
import ReminderOverlay from '../src/screens/elder/ReminderOverlay'
import History from '../src/screens/app/History'
import Today from '../src/screens/app/Today'

const minuteAgo = (m: number) => { const d = new Date(Date.now() - m * 60_000); d.setSeconds(0, 0); return d.toISOString() }
const D = (id: string, name: string, at: string, status = 'pending') => ({
  id, medication_id: `m-${id}`, name, dose: '5 mg', notes: id === 'a' ? 'with food' : null, photo_path: null,
  scheduled_at: at, status, reminder_sent_at: null, missed_alert_sent_at: null, late_alert_sent_at: null,
})
const as = (role: string) => vi.mocked(useAuth).mockReturnValue({
  profile: { id: 'u', household_id: 'h', role, display_name: 'X', lang: 'en' },
  household: { id: 'h', name: 'H', timezone: 'Asia/Riyadh', missed_wait_minutes: 30 },
} as unknown as ReturnType<typeof useAuth>)
afterEach(() => vi.useRealTimers())
const view = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }) // a fixed clock (midday in Riyadh) so "today" never flips during a test run
  vi.setSystemTime(new Date('2026-11-14T09:00:00Z'))
  vi.clearAllMocks(); setLanguage('en'); as('elder')
  vi.mocked(sound.isUnlocked).mockReturnValue(true)
  vi.mocked(api.markSlotTaken).mockResolvedValue(2)
})

describe('Elder Today', () => {
  const due = () => { const at = minuteAgo(5); vi.mocked(api.listDoses).mockResolvedValue([D('a', 'Metformin', at), D('b', 'Aspirin', at)] as never); return at }

  it('shows one popup with every medicine due and a single Taken button', async () => {
    due()
    view(<ReminderOverlay />)
    expect(await screen.findByText('Metformin')).toBeInTheDocument()
    expect(screen.getByText('Aspirin')).toBeInTheDocument()
    expect(screen.getByText('with food')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Taken' })).toHaveLength(1)
    await waitFor(() => expect(sound.startAlarm).toHaveBeenCalled())
  })
  it('Taken marks the slot, stops the alarm and closes the popup', async () => {
    const at = due()
    view(<ReminderOverlay />)
    await userEvent.click(await screen.findByRole('button', { name: 'Taken' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Taken' })).toBeNull())
    expect(api.markSlotTaken).toHaveBeenCalledTimes(1)
    expect(api.markSlotTaken).toHaveBeenCalledWith(at)
    expect(sound.stopAlarm).toHaveBeenCalled()
    expect(screen.getByText(/✓/)).toBeInTheDocument()
  })
  it('keeps the popup and offers Retry when saving fails', async () => {
    due()
    vi.mocked(api.markSlotTaken).mockRejectedValueOnce(new Error('offline'))
    view(<ReminderOverlay />)
    await userEvent.click(await screen.findByRole('button', { name: 'Taken' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Metformin')).toBeInTheDocument()
    expect(screen.queryByText(/✓/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(api.markSlotTaken).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Taken' })).toBeNull())
  })
  it('with nothing due it shows Add reading and no popup', async () => {
    vi.mocked(api.listDoses).mockResolvedValue([D('a', 'Metformin', new Date(Date.now() + 3_600_000).toISOString())] as never)
    view(<ElderToday />)
    expect(await screen.findByRole('button', { name: 'Add reading' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Taken' })).toBeNull()
    expect(sound.startAlarm).not.toHaveBeenCalled()
  })
  it('still shows the popup when sound is locked, with a Turn on sound button', async () => {
    due()
    vi.mocked(sound.isUnlocked).mockReturnValue(false)
    view(<ReminderOverlay />)
    expect(await screen.findByText('Metformin')).toBeInTheDocument()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn on sound' }))
    expect(sound.unlock).toHaveBeenCalled()
  })
  it('shows a clear error with Retry when the day cannot be loaded', async () => {
    vi.mocked(api.listDoses).mockRejectedValue(new Error('offline'))
    view(<ElderToday />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})

describe('Taken that changes nothing on the server', () => {
  it('overlay: no success tick, and the day is reloaded', async () => {
    const at = minuteAgo(5)
    vi.mocked(api.listDoses).mockResolvedValue([D('a', 'Metformin', at)] as never)
    vi.mocked(api.markSlotTaken).mockResolvedValue(0)
    view(<ReminderOverlay />)
    await userEvent.click(await screen.findByRole('button', { name: 'Taken' }))
    await waitFor(() => expect(api.listDoses).toHaveBeenCalledTimes(2))
    expect(screen.queryByText(/✓/)).toBeNull()
    expect(screen.getByText('Metformin')).toBeInTheDocument()
  })
  it('helper Today: no false "taken", and the day is reloaded', async () => {
    as('helper')
    const at = minuteAgo(5)
    vi.mocked(api.listDoses).mockResolvedValue([D('a', 'Metformin', at)] as never)
    vi.mocked(api.markSlotTaken).mockResolvedValue(0)
    view(<Today />)
    await userEvent.click(await screen.findByRole('button', { name: 'Taken' }))
    await waitFor(() => expect(api.listDoses).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Taken late')).toBeNull()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
  it('helper Today: a missed slot cannot be marked once a later dose of that medicine is due', async () => {
    as('helper')
    const start = zonedToUtc(localDate(new Date(), 'Asia/Riyadh'), '00:00:00', 'Asia/Riyadh').getTime() // earlier today, whatever the clock says
    const d = (sec: number) => new Date(start + sec * 1000).toISOString()
    const base = { medication_id: 'm-x', name: 'Metformin', dose: '5 mg', notes: null, photo_path: null, reminder_sent_at: null, missed_alert_sent_at: null, late_alert_sent_at: null }
    vi.mocked(api.listDoses).mockResolvedValue([
      { ...base, id: 'old', scheduled_at: d(0), status: 'missed' }, { ...base, id: 'new', scheduled_at: d(1), status: 'taken' },
    ] as never)
    view(<Today />)
    await screen.findAllByText(/Metformin/)
    expect(screen.queryByRole('button', { name: 'Taken' })).toBeNull()
  })
})

describe('Today (helper)', () => {
  it('lists today and marks a due slot taken', async () => {
    as('helper')
    const at = minuteAgo(5)
    vi.mocked(api.listDoses).mockResolvedValue([D('a', 'Metformin', at), D('c', 'Statin', new Date(Date.now() + 7_200_000).toISOString())] as never)
    view(<Today />)
    expect(await screen.findByText(/Metformin/)).toBeInTheDocument()
    expect(screen.getByText(/Statin/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Taken' }))
    await waitFor(() => expect(api.markSlotTaken).toHaveBeenCalledWith(at))
  })
})

describe('History', () => {
  it('shows taken, taken late and missed for a day', async () => {
    as('family')
    const day = new Date(Date.now() - 86_400_000)
    day.setHours(12, 0, 0, 0)
    const at = (h: number) => new Date(day.getTime() + h * 3_600_000).toISOString()
    vi.mocked(api.listDoses).mockResolvedValue([
      D('a', 'Metformin', at(0), 'taken'), D('b', 'Aspirin', at(1), 'taken_late'), D('c', 'Statin', at(2), 'missed'),
    ] as never)
    view(<History />)
    expect(await screen.findByText('Taken late')).toBeInTheDocument()
    expect(screen.getByText('Missed')).toBeInTheDocument()
    expect(screen.getAllByText('Taken').length).toBeGreaterThan(0)
    expect(screen.getByText(/Metformin/)).toBeInTheDocument()
  })
})
