import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { setTokenRefreshHandler } from './api'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Meeting from './pages/Meeting'
import MeetingDetail from './pages/MeetingDetail'
import Context from './pages/Context'

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('osf_token'))

  const logout = () => {
    localStorage.removeItem('osf_token')
    localStorage.removeItem('osf_refresh_token')
    setToken(null)
  }

  const onLogin = ({ access_token, refresh_token }) => {
    localStorage.setItem('osf_token', access_token)
    localStorage.setItem('osf_refresh_token', refresh_token)
    setToken(access_token)
  }

  // Whenever api.js silently refreshes the token in the background,
  // sync it into React state so every page re-renders with the fresh one.
  useEffect(() => {
    setTokenRefreshHandler((newAccessToken) => {
      if (newAccessToken) {
        localStorage.setItem('osf_token', newAccessToken)
        setToken(newAccessToken)
      } else {
        // refresh failed (refresh token also expired/invalid) — force logout
        logout()
      }
    })
  }, [])

  if (!token) return (
    <Routes>
      <Route path="/"        element={<Login onLogin={onLogin} />} />
      <Route path="/signup"  element={<Signup onLogin={onLogin} />} />
      <Route path="/forgot"  element={<ForgotPassword />} />
      <Route path="*"        element={<Navigate to="/" />} />
    </Routes>
  )

  return (
    <Routes>
      <Route path="/"                element={<Dashboard token={token} onLogout={logout} />} />
      <Route path="/meeting"         element={<Meeting token={token} />} />
      <Route path="/meeting/:id"     element={<MeetingDetail token={token} />} />
      <Route path="/context"         element={<Context token={token} />} />
      <Route path="*"                element={<Navigate to="/" />} />
    </Routes>
  )
}