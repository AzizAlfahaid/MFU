import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../src/i18n'

vi.mock('../src/lib/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../src/lib/files', () => ({ uploadPhoto: vi.fn(), signedUrl: vi.fn() }))
vi.mock('../src/lib/api', () => ({
  addReading: vi.fn().mockResolvedValue({ out_of_range: false }),
  readMeter: vi.fn(),
}))
import * as api from '../src/lib/api'
import { useAuth } from '../src/lib/auth'
import AddReading from '../src/screens/elder/AddReading'

const view = () => render(<MemoryRouter><AddReading /></MemoryRouter>)
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))
const type = (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text)

beforeEach(() => { vi.clearAllMocks(); setLanguage('en'); vi.mocked(useAuth).mockReturnValue({ household: { id: 'hid', timezone: 'Asia/Riyadh' } } as never); vi.mocked(api.addReading).mockResolvedValue({ out_of_range: false }) })

describe('typed entry', () => {
  it('reads Arabic digits, confirms, then saves a fasting sugar reading', async () => {
    view()
    await click('Blood sugar')
    await click('Fasting')
    await click('Type the number')
    await type('Blood sugar (mg/dL)', '١٢٠')
    await click('Next')
    expect(screen.getByTestId('confirm-value')).toHaveTextContent('120')
    expect(api.addReading).not.toHaveBeenCalled()
    await click('Save')
    await waitFor(() => expect(api.addReading).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sugar', context: 'fasting', value1: 120, source: 'typed' })))
    expect(await screen.findByText(/✓/)).toBeInTheDocument()
  })
  it('Change goes back to the number without saving', async () => {
    view()
    await click('Temperature')
    await click('Type the number')
    await type('Temperature (°C)', '37.5')
    await click('Next')
    await click('Change')
    expect(screen.getByLabelText('Temperature (°C)')).toHaveValue('37.5')
    expect(api.addReading).not.toHaveBeenCalled()
  })
  it('rejects text that is not a number', async () => {
    view()
    await click('Temperature')
    await click('Type the number')
    await type('Temperature (°C)', 'abc')
    await click('Next')
    expect(screen.getByRole('alert')).toHaveTextContent('Please type a number')
    expect(screen.queryByTestId('confirm-value')).toBeNull()
  })
  it('rejects an implausible number', async () => {
    view()
    await click('Temperature')
    await click('Type the number')
    await type('Temperature (°C)', '375')
    await click('Next')
    expect(screen.getByRole('alert')).toHaveTextContent('Please check the number')
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
  })
  it('blood pressure takes both numbers and tells when it is out of range', async () => {
    vi.mocked(api.addReading).mockResolvedValue({ out_of_range: true })
    view()
    await click('Blood pressure')
    await click('Type the number')
    await type('Upper number', '120')
    await type('Lower number', '95')
    await click('Next')
    expect(screen.getByTestId('confirm-value')).toHaveTextContent('120/95')
    await click('Save')
    expect(await screen.findByRole('status')).toHaveTextContent('Outside the range set by the family')
    expect(screen.getByRole('status')).not.toHaveTextContent(/should|doctor|medicine/i)
  })
  it('blood pressure needs the lower number', async () => {
    view()
    await click('Blood pressure')
    await click('Type the number')
    await type('Upper number', '120')
    await click('Next')
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
  it('shows a clear error with Retry and no tick when saving fails', async () => {
    vi.mocked(api.addReading).mockRejectedValueOnce(new Error('offline'))
    view()
    await click('Temperature')
    await click('Type the number')
    await type('Temperature (°C)', '37')
    await click('Next')
    await click('Save')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
    expect(screen.queryByText(/✓/)).toBeNull()
    await click('Try again')
    await waitFor(() => expect(api.addReading).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/✓/)).toBeInTheDocument()
  })
})
