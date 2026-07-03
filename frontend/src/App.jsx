import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
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
    setToken(null)
  }

  const onLogin = (t) => {
    localStorage.setItem('osf_token', t)
    setToken(t)
  }

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