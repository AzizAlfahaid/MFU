import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../src/i18n'

vi.mock('../src/lib/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../src/components/ReadingChart', () => ({ default: () => <div data-testid="chart" /> }))
vi.mock('../src/lib/api', () => ({
  listReadings: vi.fn(), listRanges: vi.fn().mockResolvedValue([]), saveRange: vi.fn().mockResolvedValue(undefined),
  deleteReading: vi.fn().mockResolvedValue(undefined), updateHousehold: vi.fn().mockResolvedValue(undefined),
  listMembers: vi.fn().mockResolvedValue([]), createMember: vi.fn(),
  getMyTelegram: vi.fn().mockResolvedValue({ telegram_chat_id: null, telegram_link_code: 'x' }), registerPush: vi.fn(),
}))
import * as api from '../src/lib/api'
import { useAuth } from '../src/lib/auth'
import Readings from '../src/screens/app/Readings'
import Settings from '../src/screens/app/Settings'

const as = (role: string) => vi.mocked(useAuth).mockReturnValue({
  profile: { id: 'u', household_id: 'h', role, display_name: 'X', lang: 'en' },
  household: { id: 'h', name: 'H', timezone: 'Asia/Riyadh', missed_wait_minutes: 30 },
  signOut: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined),
} as unknown as ReturnType<typeof useAuth>)
const r = (id: string, v: number, out: boolean) => ({
  id, type: 'temp', context: null, value1: v, value2: null, pulse: null, taken_at: new Date().toISOString(),
  entered_by: 'u', photo_path: null, source: 'typed', out_of_range: out,
})

beforeEach(() => { vi.clearAllMocks(); setLanguage('en'); as('family') })

describe('Readings', () => {
  beforeEach(() => vi.mocked(api.listReadings).mockResolvedValue([r('1', 37, false), r('2', 39.5, true)] as never))

  it('lists readings with a flag on the out-of-range one and shows the chart', async () => {
    as('helper')
    render(<MemoryRouter><Readings /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('tab', { name: 'Temperature' }))
    expect(await screen.findByText(/39\.5/)).toBeInTheDocument()
    expect(screen.getAllByLabelText('Outside the set range')).toHaveLength(1)
    expect(screen.getByTestId('chart')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
  it('family can delete a reading', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<MemoryRouter><Readings /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('tab', { name: 'Temperature' }))
    await userEvent.click((await screen.findAllByRole('button', { name: 'Delete' }))[0])
    await waitFor(() => expect(api.deleteReading).toHaveBeenCalled())
  })
})

describe('Settings ranges', () => {
  const fill = (label: string, low: string, high: string) => {
    fireEvent.change(screen.getByLabelText(`${label} low`), { target: { value: low } })
    fireEvent.change(screen.getByLabelText(`${label} high`), { target: { value: high } })
  }
  it('refuses low >= high', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await screen.findByText('Normal ranges')
    fill('Blood pressure upper number', '140', '90')
    await userEvent.click(screen.getByRole('button', { name: 'Save ranges' }))
    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent('Low must be below high')
    expect(api.saveRange).not.toHaveBeenCalled()
  })
  it('saves valid ranges, ignoring empty rows', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await screen.findByText('Normal ranges')
    fill('Temperature', '36', '38')
    await userEvent.click(screen.getByRole('button', { name: 'Save ranges' }))
    await waitFor(() => expect(api.saveRange).toHaveBeenCalledTimes(1))
    expect(api.saveRange).toHaveBeenCalledWith('temp', 36, 38)
  })
  it('refuses a missed-dose wait outside 5 to 240 minutes', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>)
    await screen.findByText('Normal ranges')
    fireEvent.change(screen.getByLabelText('Minutes before family is told of a missed dose'), { target: { value: '3' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save wait time' }))
    expect(api.updateHousehold).not.toHaveBeenCalled()
  })
  it('helpers do not see range settings', async () => {
    as('helper')
    render(<MemoryRouter><Settings /></MemoryRouter>)
    expect(screen.queryByText('Normal ranges')).toBeNull()
  })
})
