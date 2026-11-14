import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../src/i18n'

vi.mock('../src/lib/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../src/lib/files', () => ({ uploadPhoto: vi.fn(), signedUrl: vi.fn().mockResolvedValue('https://signed/x') }))
vi.mock('../src/lib/api', () => ({ addReading: vi.fn(), readMeter: vi.fn() }))
import * as api from '../src/lib/api'
import { useAuth } from '../src/lib/auth'
import * as files from '../src/lib/files'
import AddReading from '../src/screens/elder/AddReading'

const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const photo = () => fireEvent.change(screen.getByTestId('photo-input-reading'), { target: { files: [new File(['x'], 'm.jpg', { type: 'image/jpeg' })] } })
const start = async () => {
  render(<MemoryRouter><AddReading /></MemoryRouter>)
  await click('Blood sugar')
  await click('Fasting')
  await click('Take a photo of the meter')
}

beforeEach(() => {
  vi.clearAllMocks(); setLanguage('en')
  vi.mocked(useAuth).mockReturnValue({ household: { id: 'hid', timezone: 'Asia/Riyadh' } } as never)
  vi.mocked(files.uploadPhoto).mockResolvedValue('hid/readings/p.jpg')
  vi.mocked(api.addReading).mockResolvedValue({ out_of_range: false })
})

describe('meter photo', () => {
  it('shows the number it read, saves nothing until confirmed, and saves the edited number', async () => {
    vi.mocked(api.readMeter).mockResolvedValue({ readable: true, value1: 126, confident: true })
    await start()
    photo()
    expect(await screen.findByLabelText('Blood sugar (mg/dL)')).toHaveValue('126')
    expect(screen.getByText('Check that the number matches the meter')).toBeInTheDocument()
    expect(api.addReading).not.toHaveBeenCalled()
    await userEvent.clear(screen.getByLabelText('Blood sugar (mg/dL)'))
    await userEvent.type(screen.getByLabelText('Blood sugar (mg/dL)'), '128')
    await click('Next')
    expect(screen.getByTestId('confirm-value')).toHaveTextContent('128')
    expect(api.addReading).not.toHaveBeenCalled()
    await click('Save')
    await waitFor(() => expect(api.addReading).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sugar', context: 'fasting', value1: 128, source: 'photo', photo_path: 'hid/readings/p.jpg' })))
    expect(api.readMeter).toHaveBeenCalledWith('hid/readings/p.jpg', 'sugar')
  })
  it('asks the user to type when the photo cannot be read, and keeps the photo', async () => {
    vi.mocked(api.readMeter).mockResolvedValue({ readable: false })
    await start()
    photo()
    expect(await screen.findByText('Could not read the photo. Please type the number.')).toBeInTheDocument()
    expect(screen.getByLabelText('Blood sugar (mg/dL)')).toHaveValue('')
    expect(api.addReading).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Blood sugar (mg/dL)'), '110')
    await click('Next')
    await click('Save')
    await waitFor(() => expect(api.addReading).toHaveBeenCalledWith(
      expect.objectContaining({ value1: 110, source: 'typed', photo_path: 'hid/readings/p.jpg' })))
  })
  it('falls back to typing when the upload fails', async () => {
    vi.mocked(files.uploadPhoto).mockRejectedValue(new Error('offline'))
    await start()
    photo()
    expect(await screen.findByText('Could not send the photo. Please type the number.')).toBeInTheDocument()
    expect(screen.getByLabelText('Blood sugar (mg/dL)')).toBeInTheDocument()
    expect(api.readMeter).not.toHaveBeenCalled()
  })
  it('warns more strongly when the reading is not confident', async () => {
    vi.mocked(api.readMeter).mockResolvedValue({ readable: true, value1: 126, confident: false })
    await start()
    photo()
    expect(await screen.findByText('Check that the number matches the meter')).toHaveClass('error')
  })
})
