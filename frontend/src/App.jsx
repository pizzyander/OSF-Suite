import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { setTokenRefreshHandler, api } from './api'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import VerifyEmail from './pages/VerifyEmail'
import Dashboard from './pages/Dashboard'
import Meeting from './pages/Meeting'
import MeetingDetail from './pages/MeetingDetail'
import Context from './pages/Context'
import Onboarding from './pages/Onboarding'
import JoinOrg from './pages/JoinOrg'
import Team from './pages/Team'
import ManagerDashboard from './pages/ManagerDashboard'
import Coaching from './pages/Coaching'
import Pricing from './pages/Pricing'
import BillingCallback from './pages/BillingCallback'
import Billing from './pages/Billing'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('osf_token'))
  const [profile, setProfile] = useState(null)     // full /agents/me response
  const [profileLoading, setProfileLoading] = useState(true)

  const logout = () => {
    localStorage.removeItem('osf_token')
    localStorage.removeItem('osf_refresh_token')
    setToken(null)
    setProfile(null)
  }

  const loadProfile = async (t) => {
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
          // Invite may have expired/been revoked between signup and now —
          // don't block the app over it, just drop the stale pending token.
          console.error('Could not auto-accept pending invite:', err)
          localStorage.removeItem('osf_pending_invite')
        }
      }
    } catch (err) {
      console.error('Failed to load profile:', err)
      logout() // token is probably invalid/expired beyond refresh
    } finally {
      setProfileLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      loadProfile(token)
    } else {
      setProfileLoading(false)
    }
  }, [])

  const onLogin = async ({ access_token, refresh_token }) => {
    localStorage.setItem('osf_token', access_token)
    localStorage.setItem('osf_refresh_token', refresh_token)
    setToken(access_token)
    setProfileLoading(true)
    await loadProfile(access_token)
  }

  useEffect(() => {
    setTokenRefreshHandler((newAccessToken) => {
      if (newAccessToken) {
        localStorage.setItem('osf_token', newAccessToken)
        setToken(newAccessToken)
      } else {
        logout()
      }
    })
  }, [])

  const handleOnboardingComplete = () => {
    loadProfile(token) // re-fetch so onboarding_completed reflects true everywhere
  }

  // /join, /reset-password, and /verify-email are all public-ish routes —
  // someone may not be logged in yet (join, verify) or may be resetting
  // a password specifically BECAUSE they can't log in — so all three
  // render before the token/profile gate below, not after it.
  const isJoinRoute = window.location.pathname === '/join'
  const isResetPasswordRoute = window.location.pathname === '/reset-password'
  const isBillingCallbackRoute = window.location.pathname === '/billing/callback'
  const isVerifyEmailRoute = window.location.pathname === '/verify-email'

  if (isJoinRoute) {
    return (
      <Routes>
        <Route path="/join" element={<JoinOrg token={token} onAccepted={() => loadProfile(token)} />} />
      </Routes>
    )
  }

  if (isResetPasswordRoute) {
    return (
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    )
  }

  if (isBillingCallbackRoute) {
    return (
      <Routes>
        <Route path="/billing/callback" element={<BillingCallback token={token} />} />
      </Routes>
    )
  }

  if (isVerifyEmailRoute) {
    return (
      <Routes>
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Routes>
    )
  }

  if (!token) return (
    <Routes>
      <Route path="/"        element={<Login onLogin={onLogin} />} />
      <Route path="/signup"  element={<Signup onLogin={onLogin} />} />
      <Route path="/forgot"  element={<ForgotPassword />} />
      <Route path="*"        element={<Navigate to="/" />} />
    </Routes>
  )

  if (profileLoading) {
    // Brief loading state while we determine onboarding status — avoids a
    // flash of the dashboard before redirecting to /onboarding, which
    // would look broken rather than intentional.
    return <div style={{ minHeight: '100vh', background: '#0f0f0f' }} />
  }

  if (profile && !profile.onboarding_completed) {
    return (
      <Routes>
        <Route path="*" element={<Onboarding token={token} onComplete={handleOnboardingComplete} />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/"                element={<Dashboard token={token} profile={profile} onLogout={logout} />} />
      <Route path="/meeting"         element={<Meeting token={token} />} />
      <Route path="/meeting/:id"     element={<MeetingDetail token={token} />} />
      <Route path="/context"         element={<Context token={token} />} />
      <Route path="/team"            element={<Team token={token} profile={profile} />} />
      <Route path="/manager"         element={<ManagerDashboard token={token} profile={profile} />} />
      <Route path="/coaching"        element={<Coaching token={token} />} />
      <Route path="/pricing"         element={<Pricing token={token} profile={profile} />} />
      <Route path="/billing"         element={<Billing token={token} profile={profile} />} />
      <Route path="/onboarding"      element={<Onboarding token={token} onComplete={handleOnboardingComplete} />} />
      <Route path="*"                element={<Navigate to="/" />} />
    </Routes>
  )
}
