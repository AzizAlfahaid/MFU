import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { toEmail } from '@shared/login'
import { setLanguage } from '../i18n'
import { fetchHousehold, fetchProfile } from './api'
import { supabase } from './supabase'
import type { Household, Profile } from './types'

type Status = 'loading' | 'signedOut' | 'noHousehold' | 'ready' | 'error'
interface AuthState { status: Status; profile: Profile | null; household: Household | null }
export interface AuthValue extends AuthState {
  signIn(login: string, password: string): Promise<void>
  signUp(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  refresh(): Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', profile: null, household: null })

  const load = useCallback(async (session: Session | null) => {
    if (!session) return setState({ status: 'signedOut', profile: null, household: null })
    try {
      const profile = await fetchProfile(session.user.id)
      if (!profile) return setState({ status: 'noHousehold', profile: null, household: null })
      const household = await fetchHousehold(profile.household_id)
      setLanguage(profile.lang)
      setState({ status: 'ready', profile, household })
    } catch {
      // The session is fine; we just could not reach the server. Never show the login form for that.
      setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', profile: null, household: null }))
    }
  }, [])

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => load(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => void load(session), 0) // never await supabase calls inside this callback
    })
    return () => data.subscription.unsubscribe()
  }, [load])

  useEffect(() => {
    if (state.status !== 'error') return
    const id = setInterval(() => void supabase.auth.getSession().then(({ data }) => load(data.session)), 10_000)
    return () => clearInterval(id)
  }, [state.status, load])

  const value = useMemo<AuthValue>(() => ({
    ...state,
    async signIn(login, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: toEmail(login), password })
      if (error) throw error
    },
    async signUp(email, password) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) throw error
    },
    async signOut() {
      await supabase.auth.signOut()
    },
    async refresh() {
      const { data } = await supabase.auth.getSession()
      await load(data.session)
    },
  }), [state, load])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
