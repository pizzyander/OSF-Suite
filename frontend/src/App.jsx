import { Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Meeting from './pages/Meeting'
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

  if (!token) return <Login onLogin={onLogin} />

  return (
    <Routes>
      <Route path="/"         element={<Dashboard token={token} onLogout={logout} />} />
      <Route path="/meeting"  element={<Meeting   token={token} />} />
      <Route path="/context"  element={<Context   token={token} />} />
      <Route path="*"         element={<Navigate to="/" />} />
    </Routes>
  )
}