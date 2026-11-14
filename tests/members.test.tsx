import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { setLanguage } from '../src/i18n'

vi.mock('../src/lib/auth', () => ({ useAuth: vi.fn() }))
vi.mock('../src/lib/api', () => ({
  listMembers: vi.fn(), createMember: vi.fn(), manageMember: vi.fn().mockResolvedValue(undefined),
  listRanges: vi.fn().mockResolvedValue([]), saveRange: vi.fn(), updateHousehold: vi.fn(),
  getMyTelegram: vi.fn().mockResolvedValue({ telegram_chat_id: null, telegram_link_code: 'x' }), registerPush: vi.fn(),
}))
import * as api from '../src/lib/api'
import { useAuth } from '../src/lib/auth'
import Settings from '../src/screens/app/Settings'

const members = [
  { id: 'me', role: 'family', display_name: 'Sara', lang: 'en', has_telegram: false },
  { id: 'h1', role: 'helper', display_name: 'Nour', lang: 'ar', has_telegram: false },
  { id: 'e1', role: 'elder', display_name: 'Mama', lang: 'ar', has_telegram: false },
]
beforeEach(() => {
  vi.clearAllMocks(); setLanguage('en')
  vi.mocked(api.manageMember).mockResolvedValue(undefined)
  vi.mocked(api.listMembers).mockResolvedValue(members as never)
  vi.mocked(useAuth).mockReturnValue({
    profile: { id: 'me', household_id: 'h', role: 'family', display_name: 'Sara', lang: 'en' },
    household: { id: 'h', name: 'H', timezone: 'Asia/Riyadh', missed_wait_minutes: 30 }, signOut: vi.fn(), refresh: vi.fn(),
  } as unknown as ReturnType<typeof useAuth>)
})
const row = async (name: string) => {
  const items = await screen.findAllByRole('listitem')
  return within(items.find((li) => li.textContent?.startsWith(name)) as HTMLElement)
}

it('family can remove another member after confirming, but not themselves', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<MemoryRouter><Settings /></MemoryRouter>)
  const nour = await row('Nour')
  await userEvent.click(nour.getByRole('button', { name: 'Remove' }))
  expect(api.manageMember).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  await userEvent.click(nour.getByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(api.manageMember).toHaveBeenCalledWith({ action: 'remove', id: 'h1' }))
  expect((await row('Sara')).queryByRole('button', { name: 'Remove' })).toBeNull()
})
it('family can set a new password for someone', async () => {
  render(<MemoryRouter><Settings /></MemoryRouter>)
  const mama = await row('Mama')
  await userEvent.click(mama.getByRole('button', { name: 'New password' }))
  await userEvent.type(mama.getByLabelText('New password for Mama'), 'short')
  await userEvent.click(mama.getByRole('button', { name: 'Save password' }))
  expect(api.manageMember).not.toHaveBeenCalled()
  expect(await screen.findByRole('alert')).toHaveTextContent('at least 8')
  await userEvent.clear(mama.getByLabelText('New password for Mama'))
  await userEvent.type(mama.getByLabelText('New password for Mama'), 'brandnew123')
  await userEvent.click(mama.getByRole('button', { name: 'Save password' }))
  await waitFor(() => expect(api.manageMember).toHaveBeenCalledWith({ action: 'reset_password', id: 'e1', password: 'brandnew123' }))
})
it('family can change a person\'s language', async () => {
  render(<MemoryRouter><Settings /></MemoryRouter>)
  const mama = await row('Mama')
  await userEvent.selectOptions(mama.getByLabelText('Language of Mama'), 'en')
  await waitFor(() => expect(api.manageMember).toHaveBeenCalledWith({ action: 'set_lang', id: 'e1', lang: 'en' }))
})
it('warns when no family member has Telegram connected', async () => {
  render(<MemoryRouter><Settings /></MemoryRouter>)
  expect(await screen.findByText(/No family member has Telegram connected/)).toBeInTheDocument()
})
it('shows an error and keeps the member when removing fails', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.mocked(api.manageMember).mockRejectedValueOnce(new Error('last_family'))
  render(<MemoryRouter><Settings /></MemoryRouter>)
  await userEvent.click((await row('Nour')).getByRole('button', { name: 'Remove' }))
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  await row('Nour')
})
