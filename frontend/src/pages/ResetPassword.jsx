import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { validatePassword, passwordStrength } from '../validation'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()

  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)

  const strength = passwordStrength(password)

  const submit = async (e) => {
    e.preventDefault()
    const pwError = validatePassword(password)
    if (pwError) { setError(pwError); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (!token) { setError('This reset link is missing its token.'); return }

    setLoading(true)
    setError('')
    try {
      await api.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <h1 style={s.title}>Link invalid</h1>
          <p style={s.sub}>This password reset link is missing its token. Request a new one.</p>
          <button style={s.btn} onClick={() => navigate('/forgot')}>Request new link</button>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={s.wrap}>
        <div style={s.card}>
          <div style={s.checkmark}>✓</div>
          <h1 style={s.title}>Password reset</h1>
          <p style={s.sub}>You can now log in with your new password.</p>
          <button style={s.btn} onClick={() => navigate('/')}>Go to sign in</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h1 style={s.title}>Set a new password</h1>
        <p style={s.sub}>Choose a new password for your account.</p>
        <form onSubmit={submit} style={s.form}>
          <input style={s.input} type="password" placeholder="New password"
            value={password} onChange={e => setPassword(e.target.value)} required />
          {password && (
            <p style={{ ...s.strength, color: strengthColor(strength.score) }}>{strength.label}</p>
          )}
          <input style={s.input} type="password" placeholder="Confirm new password"
            value={confirm} onChange={e => setConfirm(e.target.value)} required />
          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} disabled={loading}>
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  )
}

function strengthColor(score) {
  if (score <= 1) return '#ff6b6b'
  if (score <= 3) return '#ffd93d'
  return '#6bffb8'
}

const s = {
  wrap:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f', padding: '1.5rem' },
  card:      { background: '#1a1a1a', padding: '2.5rem', borderRadius: '12px', width: '100%', maxWidth: '380px', border: '1px solid #2a2a2a', textAlign: 'center' },
  checkmark: { width: '48px', height: '48px', borderRadius: '50%', background: '#6c5ce7', color: '#fff', fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' },
  title:     { color: '#fff', margin: '0 0 4px', fontSize: '22px', fontWeight: 600 },
  sub:       { color: '#888', margin: '0 0 1.5rem', fontSize: '14px', lineHeight: 1.5 },
  form:      { display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' },
  input:     { padding: '10px 14px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff', fontSize: '14px' },
  strength:  { fontSize: '12px', margin: '-4px 0 0', fontWeight: 600 },
  error:     { color: '#ff6b6b', fontSize: '13px', margin: 0 },
  btn:       { padding: '11px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px', width: '100%', marginTop: '4px' },
}
