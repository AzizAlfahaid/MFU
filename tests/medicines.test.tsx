import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../src/i18n'

vi.mock('../src/lib/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../src/lib/files', () => ({
  uploadPhoto: vi.fn().mockResolvedValue('hid/medications/new.jpg'),
  signedUrl: vi.fn().mockResolvedValue('https://signed/x'),
}))
vi.mock('../src/lib/api', () => ({
  listMedications: vi.fn(),
  saveMedication: vi.fn().mockResolvedValue(undefined),
  setMedicationPhoto: vi.fn().mockResolvedValue(undefined),
  deleteMedication: vi.fn().mockResolvedValue(undefined),
}))
import * as api from '../src/lib/api'
import { useAuth } from '../src/lib/auth'
import MedicineForm from '../src/screens/app/MedicineForm'
import Medicines from '../src/screens/app/Medicines'

const as = (role: string) => vi.mocked(useAuth).mockReturnValue({
  profile: { id: 'u', household_id: 'hid', role, display_name: 'X', lang: 'en' },
  household: { id: 'hid', name: 'H', timezone: 'Asia/Riyadh', missed_wait_minutes: 30 },
} as unknown as ReturnType<typeof useAuth>)
const med = { id: 'm1', household_id: 'hid', name: 'Metformin', dose: '500 mg', notes: 'with food', photo_path: 'hid/medications/a.jpg', active: true, times: ['08:00', '20:00'] }

beforeEach(() => { vi.clearAllMocks(); setLanguage('en'); as('family') })

describe('MedicineForm', () => {
  const setup = (onSaved = vi.fn()) => render(<MedicineForm onSaved={onSaved} onCancel={vi.fn()} />)
  const setTime = (i: number, v: string) => fireEvent.change(screen.getAllByLabelText('Time')[i], { target: { value: v } })

  it('needs a name', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Dose'), '5 mg')
    setTime(0, '08:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('name')
    expect(api.saveMedication).not.toHaveBeenCalled()
  })
  it('needs at least one time', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Medicine name'), 'Aspirin')
    await userEvent.type(screen.getByLabelText('Dose'), '75 mg')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('time')
    expect(api.saveMedication).not.toHaveBeenCalled()
  })
  it('saves a repeated time once', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Medicine name'), 'Aspirin')
    await userEvent.type(screen.getByLabelText('Dose'), '75 mg')
    setTime(0, '08:00')
    await userEvent.click(screen.getByRole('button', { name: 'Add a time' }))
    setTime(1, '08:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.saveMedication).toHaveBeenCalled())
    expect(vi.mocked(api.saveMedication).mock.calls[0][0].times).toEqual(['08:00'])
  })
  it('submits name, dose, notes and sorted times', async () => {
    const onSaved = vi.fn()
    setup(onSaved)
    await userEvent.type(screen.getByLabelText('Medicine name'), 'Metformin')
    await userEvent.type(screen.getByLabelText('Dose'), '500 mg')
    await userEvent.type(screen.getByLabelText('Notes'), 'with food')
    setTime(0, '20:00')
    await userEvent.click(screen.getByRole('button', { name: 'Add a time' }))
    setTime(1, '08:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api.saveMedication).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Metformin', dose: '500 mg', notes: 'with food', times: ['08:00', '20:00'], active: true,
    }))
  })
  it('keeps the form and shows an error when saving fails', async () => {
    vi.mocked(api.saveMedication).mockRejectedValueOnce(new Error('x'))
    const onSaved = vi.fn()
    setup(onSaved)
    await userEvent.type(screen.getByLabelText('Medicine name'), 'A')
    await userEvent.type(screen.getByLabelText('Dose'), '1')
    setTime(0, '08:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(onSaved).not.toHaveBeenCalled()
  })
})

describe('Medicines list', () => {
  const list = () => render(<MemoryRouter><Medicines /></MemoryRouter>)
  beforeEach(() => vi.mocked(api.listMedications).mockResolvedValue([med]))

  it('helper sees medicines and may only change the photo', async () => {
    as('helper')
    list()
    expect(await screen.findByText('Metformin')).toBeInTheDocument()
    expect(screen.getByText(/500 mg/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change photo' })).toBeInTheDocument()
    for (const name of ['Add medicine', 'Edit', 'Delete']) expect(screen.queryByRole('button', { name })).toBeNull()
  })
  it('helper photo change uploads then saves the path', async () => {
    as('helper')
    list()
    await screen.findByText('Metformin')
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('photo-input-m1'), { target: { files: [file] } })
    await waitFor(() => expect(api.setMedicationPhoto).toHaveBeenCalledWith('m1', 'hid/medications/new.jpg'))
  })
  it('family can add, edit and delete', async () => {
    list()
    await screen.findByText('Metformin')
    for (const name of ['Add medicine', 'Edit', 'Delete']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })
  it('family delete asks first', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    list()
    await screen.findByText('Metformin')
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(api.deleteMedication).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.deleteMedication).toHaveBeenCalledWith('m1'))
  })
})
