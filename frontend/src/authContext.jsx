import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { setTokenRefreshHandler, api } from './api'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('osf_token'))
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  const logout = useCallback(() => {
    localStorage.removeItem('osf_token')
    localStorage.removeItem('osf_refresh_token')
    setToken(null)
    setProfile(null)
  }, [])

  const loadProfile = useCallback(async (t) => {
    try {
      const me = await api.me(t)
      setProfile(me)

      const pendingInvite = localStorage.getItem('osf_pending_invite')
      if (pendingInvite && !me.org_id) {
        try {
          await api.acceptInvite(t, pendingInvite)
          localStorage.removeItem('osf_pending_invite')
          const refreshed = await api.me(t)
          setProfile(refreshed)
        } catch (err) {
          console.error('Could not auto-accept pending invite:', err)
          localStorage.removeItem('osf_pending_invite')
        }
      }
    } catch (err) {
      console.error('Failed to load profile:', err)
      logout()
    } finally {
      setProfileLoading(false)
    }
  }, [logout])

  useEffect(() => {
    if (token) {
      loadProfile(token)
    } else {
      setProfileLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onLogin = useCallback(async ({ access_token, refresh_token }) => {
    localStorage.setItem('osf_token', access_token)
    localStorage.setItem('osf_refresh_token', refresh_token)
    setToken(access_token)
    setProfileLoading(true)
    await loadProfile(access_token)
  }, [loadProfile])

  useEffect(() => {
    setTokenRefreshHandler((newAccessToken) => {
      if (newAccessToken) {
        localStorage.setItem('osf_token', newAccessToken)
        setToken(newAccessToken)
      } else {
        logout()
      }
    })
  }, [logout])

  // CHANGED: now takes an explicit token argument, used in preference to
  // context's own `token` state. This function is invoked from deep
  // inside Onboarding.jsx's async account-creation flow, which started
  // running (and closed over whatever `onComplete` reference existed)
  // BEFORE the user was logged in — at that point context's `token` was
  // still null. A later re-render producing a fresh closure doesn't
  // retroactively fix a promise chain already in flight. Accepting the
  // token explicitly, the same way onLogin already does, sidesteps the
  // stale-closure trap entirely rather than depending on React's render
  // timing lining up correctly.
  const handleOnboardingComplete = useCallback(async (explicitToken) => {
    await loadProfile(explicitToken || token)
  }, [loadProfile, token])

  return (
    <AuthContext.Provider value={{
      token, profile, profileLoading,
      onLogin, logout, loadProfile, handleOnboardingComplete,
    }}>
      {children}
    </AuthContext.Provider>
  )
}