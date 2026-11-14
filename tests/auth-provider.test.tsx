import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

const session = { user: { id: 'u1' } }
let authCallback: (e: string, s: unknown) => void = () => undefined
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => { authCallback = cb; return { data: { subscription: { unsubscribe: vi.fn() } } } }),
    },
  },
}))
vi.mock('../src/lib/api', () => ({ fetchProfile: vi.fn(), fetchHousehold: vi.fn() }))
import * as api from '../src/lib/api'
import { AuthProvider, useAuth } from '../src/lib/auth'
import { supabase } from '../src/lib/supabase'

const profile = { id: 'u1', household_id: 'h', role: 'elder', display_name: 'E', lang: 'ar' }
const household = { id: 'h', name: 'H', timezone: 'Asia/Riyadh', missed_wait_minutes: 30 }
function Probe() { const a = useAuth(); return <p data-testid="s">{a.status}</p> }
const mount = () => render(<AuthProvider><Probe /></AuthProvider>)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session } } as never)
  vi.mocked(api.fetchProfile).mockResolvedValue(profile as never)
  vi.mocked(api.fetchHousehold).mockResolvedValue(household as never)
})

it('is ready when everything loads', async () => {
  mount()
  await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('ready'))
})
it('signed out only when there is no session', async () => {
  vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never)
  mount()
  await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('signedOut'))
})
it('a failed profile load while signed in is an error, not signed out', async () => {
  vi.mocked(api.fetchProfile).mockRejectedValue(new Error('offline'))
  mount()
  await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('error'))
})
it('a later failed refresh keeps an already-loaded user ready', async () => {
  mount()
  await waitFor(() => expect(screen.getByTestId('s')).toHaveTextContent('ready'))
  vi.mocked(api.fetchProfile).mockRejectedValue(new Error('offline'))
  await act(async () => { authCallback('TOKEN_REFRESHED', session); await new Promise((r) => setTimeout(r, 10)) })
  expect(screen.getByTestId('s')).toHaveTextContent('ready')
})
