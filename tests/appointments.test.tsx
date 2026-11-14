import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { localDate, zonedToUtc } from '@shared/time'
import { setLanguage } from '../src/i18n'

vi.mock('../src/lib/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../src/lib/files', () => ({ signedUrl: vi.fn().mockResolvedValue('x') }))
vi.mock('../src/lib/sound', () => ({ isUnlocked: vi.fn(() => true), unlock: vi.fn(), startAlarm: vi.fn(), stopAlarm: vi.fn() }))
vi.mock('../src/lib/api', () => ({
  listAppointments: vi.fn(), listHospitals: vi.fn().mockResolvedValue([{ id: 'h1', name: 'King Fahd' }]),
  saveAppointment: vi.fn().mockResolvedValue(undefined), deleteAppointment: vi.fn().mockResolvedValue(undefined),
  listDoses: vi.fn().mockResolvedValue([]), subscribeDoses: vi.fn(() => () => undefined), markSlotTaken: vi.fn(),
}))
import * as api from '../src/lib/api'
import { useAuth } from '../src/lib/auth'
import ElderToday from '../src/screens/elder/ElderToday'
import AppointmentForm from '../src/screens/app/AppointmentForm'
import Appointments from '../src/screens/app/Appointments'

const TZ = 'Asia/Riyadh'
const as = (role: string) => vi.mocked(useAuth).mockReturnValue({
  profile: { id: 'u', household_id: 'h', role, display_name: 'X', lang: 'en' },
  household: { id: 'h', name: 'H', timezone: TZ, missed_wait_minutes: 30 },
} as unknown as ReturnType<typeof useAuth>)
const appt = (id: string, startsAt: string, extra = {}) => ({
  id, starts_at: startsAt, hospital_id: 'h1', hospital: 'King Fahd', doctor: 'Dr Sara', purpose: 'Check-up', notes: null, ...extra,
})
const day = (offset: number, time: string) => {
  const d = new Date(Date.now() + offset * 86_400_000)
  return zonedToUtc(localDate(d, TZ), time, TZ).toISOString()
}

beforeEach(() => { vi.clearAllMocks(); setLanguage('en'); as('family'); vi.mocked(api.listHospitals).mockResolvedValue([{ id: 'h1', name: 'King Fahd' }]) })

describe('AppointmentForm', () => {
  const fill = async () => {
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-20' } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '10:30' } })
  }
  it('builds the start time in the household time zone', async () => {
    const onSaved = vi.fn()
    render(<AppointmentForm onSaved={onSaved} onCancel={vi.fn()} />)
    await fill()
    await userEvent.type(screen.getByLabelText('Hospital'), 'King Fahd')
    await userEvent.type(screen.getByLabelText('Doctor'), 'Dr Sara')
    await userEvent.type(screen.getByLabelText('Purpose'), 'Check-up')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api.saveAppointment).toHaveBeenCalledWith(expect.objectContaining({
      starts_at: '2026-11-20T07:30:00.000Z', hospital_name: 'King Fahd', doctor: 'Dr Sara', purpose: 'Check-up',
    }))
  })
  it('needs a date and a time', async () => {
    render(<AppointmentForm onSaved={vi.fn()} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-20' } })
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('date and time')
    expect(api.saveAppointment).not.toHaveBeenCalled()
  })
  it('shows the saved time on the local clock when editing', () => {
    render(<AppointmentForm initial={appt('a1', '2026-11-20T07:30:00.000Z') as never} onSaved={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-20')
    expect(screen.getByLabelText('Time')).toHaveValue('10:30')
    expect(screen.getByLabelText('Hospital')).toHaveValue('King Fahd')
  })
  it('keeps the form and shows an error when saving fails', async () => {
    vi.mocked(api.saveAppointment).mockRejectedValueOnce(new Error('x'))
    const onSaved = vi.fn()
    render(<AppointmentForm onSaved={onSaved} onCancel={vi.fn()} />)
    await fill()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('Appointments list', () => {
  beforeEach(() => vi.mocked(api.listAppointments).mockResolvedValue([appt('p', day(-3, '09:00:00'), { doctor: 'Dr Old' }), appt('f', day(3, '10:00:00'), { doctor: 'Dr New' })] as never))
  it('family sees upcoming and past, with Add, Edit and Delete', async () => {
    render(<MemoryRouter><Appointments /></MemoryRouter>)
    expect(await screen.findByText(/Dr New/)).toBeInTheDocument()
    expect(screen.getByText(/Dr Old/)).toBeInTheDocument()
    for (const name of ['Add appointment', 'Edit', 'Delete']) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0)
  })
  it('helper can look but not change', async () => {
    as('helper')
    render(<MemoryRouter><Appointments /></MemoryRouter>)
    expect(await screen.findByText(/Dr New/)).toBeInTheDocument()
    for (const name of ['Add appointment', 'Edit', 'Delete']) expect(screen.queryByRole('button', { name })).toBeNull()
  })
  it('family delete asks first', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<MemoryRouter><Appointments /></MemoryRouter>)
    await screen.findByText(/Dr New/)
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(api.deleteAppointment).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await waitFor(() => expect(api.deleteAppointment).toHaveBeenCalled())
  })
})

describe('Elder Today appointments', () => {
  it('shows today and tomorrow appointments with hospital and doctor', async () => {
    as('elder')
    vi.mocked(api.listAppointments).mockResolvedValue([
      appt('t', zonedToUtc(localDate(new Date(), TZ), '23:59:00', TZ).toISOString(), { hospital: 'King Fahd', doctor: 'Dr Sara' }),
      appt('m', day(1, '09:00:00'), { hospital: 'Al Noor', doctor: 'Dr Omar' }),
      appt('x', day(5, '09:00:00'), { hospital: 'Far Away', doctor: 'Dr Later' }),
    ] as never)
    render(<MemoryRouter><ElderToday /></MemoryRouter>)
    expect(await screen.findByText(/King Fahd/)).toBeInTheDocument()
    expect(screen.getByText(/Dr Sara/)).toBeInTheDocument()
    expect(screen.getByText(/Al Noor/)).toBeInTheDocument()
    expect(screen.getByText('Appointment today')).toBeInTheDocument()
    expect(screen.getByText('Appointment tomorrow')).toBeInTheDocument()
    expect(screen.queryByText(/Far Away/)).toBeNull()
  })
})
