import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setLanguage } from '../src/i18n'

vi.mock('../src/lib/auth', () => ({ useAuth: vi.fn(), AuthProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/lib/api', () => ({
  listMembers: vi.fn().mockResolvedValue([]),
  getMyTelegram: vi.fn().mockResolvedValue({ telegram_chat_id: null, telegram_link_code: 'x' }),
  registerPush: vi.fn(),
  listMedications: vi.fn().mockResolvedValue([]),
  listRanges: vi.fn().mockResolvedValue([]),
  saveRange: vi.fn(),
  updateHousehold: vi.fn(),
  listReadings: vi.fn().mockResolvedValue([]),
  listDoses: vi.fn().mockResolvedValue([]),
  listAppointments: vi.fn().mockResolvedValue([]),
  subscribeDoses: vi.fn(() => () => undefined),
  markSlotTaken: vi.fn(),
  createMember: vi.fn().mockResolvedValue({ id: 'new' }),
  updateMyLang: vi.fn().mockResolvedValue(undefined),
  createHousehold: vi.fn().mockResolvedValue('hid'),
  manageMember: vi.fn().mockResolvedValue(undefined),
}))
import * as api from '../src/lib/api'
import { AppRoutes } from '../src/App'
import { useAuth } from '../src/lib/auth'

const base = { signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), refresh: vi.fn().mockResolvedValue(undefined) }
const household = { id: 'h', name: 'H', timezone: 'Asia/Riyadh', missed_wait_minutes: 30 }
const as = (role: 'elder' | 'helper' | 'family') => ({
  ...base, status: 'ready' as const, household,
  profile: { id: 'u', household_id: 'h', role, display_name: 'X', lang: 'en' as const },
})
const show = (value: object, path = '/') => {
  vi.mocked(useAuth).mockReturnValue(value as ReturnType<typeof useAuth>)
  return render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>)
}

beforeEach(() => { vi.clearAllMocks(); setLanguage('en') })

describe('routing by status and role', () => {
  it('shows loading', () => {
    show({ ...base, status: 'loading', profile: null, household: null })
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })
  it('signed out sees the login screen', () => {
    show({ ...base, status: 'signedOut', profile: null, household: null })
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
  it('a user without a household sees onboarding', () => {
    show({ ...base, status: 'noHousehold', profile: null, household: null })
    expect(screen.getByRole('button', { name: 'Create household' })).toBeInTheDocument()
  })
  it('the elder sees Today and no tab bar', () => {
    show(as('elder'))
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).toBeNull()
  })
  it('the elder still gets the medicine popup while on another screen', async () => {
    const due = new Date(Date.now() - 5 * 60_000); due.setSeconds(0, 0)
    vi.mocked(api.listDoses).mockResolvedValue([{ id: 'd', medication_id: 'm', name: 'Metformin', dose: '5 mg', notes: null, photo_path: null,
      scheduled_at: due.toISOString(), status: 'pending', reminder_sent_at: null, missed_alert_sent_at: null, late_alert_sent_at: null }] as never)
    show(as('elder'), '/add-reading')
    expect(await screen.findByRole('dialog')).toHaveTextContent('Metformin')
  })
  it('a connection problem never shows the login form', () => {
    show({ ...base, status: 'error', profile: null, household: null })
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
  it('the helper sees the tab bar but no way to add medicines', () => {
    show(as('helper'), '/medicines')
    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add medicine' })).toBeNull()
  })
  it('only family can add members', async () => {
    const { unmount } = show(as('family'), '/settings')
    expect(await screen.findByRole('button', { name: 'Add member' })).toBeInTheDocument()
    unmount()
    show(as('helper'), '/settings')
    expect(screen.queryByRole('button', { name: 'Add member' })).toBeNull()
  })
})

describe('login', () => {
  it('signs in with the typed username and password', async () => {
    const signIn = vi.fn().mockResolvedValue(undefined)
    show({ ...base, signIn, status: 'signedOut', profile: null, household: null })
    await userEvent.type(screen.getByLabelText('Username or email'), 'mama')
    await userEvent.type(screen.getByLabelText('Password'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(signIn).toHaveBeenCalledWith('mama', 'secret123')
  })
  it('shows a clear error when sign-in fails', async () => {
    const signIn = vi.fn().mockRejectedValue(new Error('bad'))
    show({ ...base, signIn, status: 'signedOut', profile: null, household: null })
    await userEvent.type(screen.getByLabelText('Username or email'), 'mama')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong username or password')
  })
})

describe('onboarding and members', () => {
  it('creates the household then refreshes', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    show({ ...base, refresh, status: 'noHousehold', profile: null, household: null })
    await userEvent.type(screen.getByLabelText('Household name'), 'Ahmed family')
    await userEvent.type(screen.getByLabelText('Your name'), 'Sara')
    await userEvent.click(screen.getByRole('button', { name: 'Create household' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(api.createHousehold).toHaveBeenCalledWith('Ahmed family', 'Sara')
  })
  it('tells a stranger the app is already set up', async () => {
    vi.mocked(api.createHousehold).mockRejectedValueOnce(new Error('household_exists'))
    show({ ...base, status: 'noHousehold', profile: null, household: null })
    await userEvent.type(screen.getByLabelText('Household name'), 'X')
    await userEvent.type(screen.getByLabelText('Your name'), 'Y')
    await userEvent.click(screen.getByRole('button', { name: 'Create household' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already set up')
  })
  it('family adds a member', async () => {
    show(as('family'), '/settings')
    await userEvent.type(await screen.findByLabelText('Name'), 'Mama')
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'elder')
    await userEvent.type(screen.getByLabelText('Username'), 'mama')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'longenough1')
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }))
    await waitFor(() => expect(api.createMember).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Mama', role: 'elder', username: 'mama', password: 'longenough1' })))
  })
  it('does not call the server for a short password', async () => {
    show(as('family'), '/settings')
    await userEvent.type(await screen.findByLabelText('Name'), 'Mama')
    await userEvent.type(screen.getByLabelText('Username'), 'mama')
    await userEvent.type(screen.getByLabelText('Password (8+ characters)'), 'short')
    await userEvent.click(screen.getByRole('button', { name: 'Add member' }))
    expect(api.createMember).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8')
  })
})
