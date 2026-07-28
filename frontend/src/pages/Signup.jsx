import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Signup({ onLogin }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    setError('')
    try {
      const data = await api.register(name, email, password)
      onLogin(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.logo}>OSF<span style={s.logoAccent}>-Suite</span></div>
        <p style={s.sub}>Create your account and start coaching your sales team.</p>
        <form onSubmit={submit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>Full name</label>
            <input style={s.input} type="text" placeholder="Jane Doe"
              value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" placeholder="you@company.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Password</label>
            <input style={s.input} type="password" placeholder="At least 8 characters"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div style={s.field}>
            <label style={s.label}>Confirm password</label>
            <input style={s.input} type="password" placeholder="Re-enter your password"
              value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <p style={s.error}>{error}</p>}
          <button style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }} disabled={loading}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <div style={s.links}>
          <button style={s.link} onClick={() => navigate('/')}>
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  wrap:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F3', padding: '1.5rem', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  card:  { background: '#FFFFFF', padding: '2.75rem 2.25rem', borderRadius: '14px', width: '100%', maxWidth: '380px', border: '1px solid #E5E2DB', boxShadow: '0 1px 2px rgba(10,26,47,0.04)' },
  logo:  { fontFamily: "'Space Grotesk', 'Inter', sans-serif", color: '#0A1A2F', fontSize: '20px', fontWeight: 700, margin: '0 0 8px' },
  logoAccent: { color: '#8F6423' },
  sub:   { color: '#8A8779', margin: '0 0 2rem', fontSize: '14px', lineHeight: 1.5 },
  form:  { display: 'flex', flexDirection: 'column', gap: '14px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { color: '#1B3A5C', fontSize: '12.5px', fontWeight: 600 },
  input: { padding: '11px 13px', borderRadius: '8px', border: '1px solid #E5E2DB', background: '#FFFFFF', color: '#2B2A26', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' },
  btn:   { padding: '12.5px', borderRadius: '8px', background: '#0A1A2F', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14.5px', fontFamily: 'inherit', marginTop: '4px' },
  btnDisabled: { opacity: 0.55, cursor: 'default' },
  error: { color: '#B3453B', fontSize: '13px', margin: 0 },
  links: { marginTop: '1.5rem', textAlign: 'center' },
  link:  { background: 'none', border: 'none', color: '#8A8779', fontSize: '13px', cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
}
