import { useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
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
          <div style={s.logo}>OSF<span style={s.logoAccent}>-Suite</span></div>
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
          <div style={s.checkmark}><Check size={24} strokeWidth={3} /></div>
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
        <div style={s.logo}>OSF<span style={s.logoAccent}>-Suite</span></div>
        <h1 style={s.title}>Set a new password</h1>
        <p style={s.sub}>Choose a new password for your account.</p>
        <form onSubmit={submit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>New password</label>
            <input style={s.input} type="password" placeholder="At least 8 characters"
              value={password} onChange={e => setPassword(e.target.value)} required />
            {password && (
              <p style={{ ...s.strength, color: strengthColor(strength.score) }}>{strength.label}</p>
            )}
          </div>
          <div style={s.field}>
            <label style={s.label}>Confirm new password</label>
            <input style={s.input} type="password" placeholder="Re-enter your new password"
              value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <p style={s.error}>{error}</p>}
          <button style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }} disabled={loading}>
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  )
}

function strengthColor(score) {
  if (score <= 1) return '#B3453B'
  if (score <= 3) return '#8F6423'
  return '#3F6249'
}

const s = {
  wrap:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F3', padding: '1.5rem', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  card:      { background: '#FFFFFF', padding: '2.75rem 2.25rem', borderRadius: '14px', width: '100%', maxWidth: '380px', border: '1px solid #E5E2DB', textAlign: 'center', boxShadow: '0 1px 2px rgba(10,26,47,0.04)' },
  logo:      { fontFamily: "'Space Grotesk', 'Inter', sans-serif", color: '#0A1A2F', fontSize: '18px', fontWeight: 700, margin: '0 0 20px' },
  logoAccent:{ color: '#8F6423' },
  checkmark: { width: '48px', height: '48px', borderRadius: '50%', background: '#0A1A2F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' },
  title:     { color: '#0A1A2F', margin: '0 0 4px', fontSize: '22px', fontWeight: 600, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  sub:       { color: '#8A8779', margin: '0 0 1.5rem', fontSize: '14px', lineHeight: 1.5 },
  form:      { display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' },
  field:     { display: 'flex', flexDirection: 'column', gap: '6px' },
  label:     { color: '#1B3A5C', fontSize: '12.5px', fontWeight: 600 },
  input:     { padding: '11px 13px', borderRadius: '8px', border: '1px solid #E5E2DB', background: '#FFFFFF', color: '#2B2A26', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' },
  strength:  { fontSize: '12px', margin: '6px 0 0', fontWeight: 600 },
  error:     { color: '#B3453B', fontSize: '13px', margin: 0 },
  btn:       { padding: '12.5px', borderRadius: '8px', background: '#0A1A2F', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14.5px', width: '100%', marginTop: '4px', fontFamily: 'inherit' },
  btnDisabled:{ opacity: 0.55, cursor: 'default' },
}
