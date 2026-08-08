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

      // If this account arrived via an invite link, finish accepting it
      // now that they're authenticated — the token was stashed in
      // localStorage by JoinOrg before sending them to Signup/Login.
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

  const handleOnboardingComplete = useCallback(() => {
    loadProfile(token)
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
