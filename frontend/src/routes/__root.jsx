import { createRootRoute, Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AuthProvider, useAuth } from '../authContext'

// Routes that must always render regardless of auth/onboarding state —
// mirrors the old App.jsx's isJoinRoute/isResetPasswordRoute/etc early
// returns. A user mid-password-reset or accepting an invite should
// never get redirected away from that flow.
const BYPASS_PATHS = ['/join', '/reset-password', '/billing/callback', '/verify-email']

function RootShell() {
  const { token, profile, profileLoading } = useAuth()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const bypassed = BYPASS_PATHS.includes(pathname)

  useEffect(() => {
    if (bypassed) return

    // Logged out, trying to reach a protected route -> send to landing/login.
    // (Public routes like /login, /signup, /forgot handle their own
    // "already logged in" redirect individually — see those route files.)

    if (token && !profileLoading && profile && !profile.onboarding_completed && pathname !== '/onboarding') {
      navigate({ to: '/onboarding' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, profile, profileLoading, pathname, bypassed])

  if (bypassed) return <Outlet />

  if (token && profileLoading) {
    // Brief loading state while we determine onboarding status — avoids
    // a flash of the dashboard before redirecting to /onboarding.
    return <div style={{ minHeight: '100vh', background: '#0f0f0f' }} />
  }

  return <Outlet />
}

export const Route = createRootRoute({
  component: () => (
    <AuthProvider>
      <RootShell />
    </AuthProvider>
  ),
})
