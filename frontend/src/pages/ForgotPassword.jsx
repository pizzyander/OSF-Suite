import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function ForgotPassword() {
  const [email, setEmail]   = useState('')
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState('')
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    if (!email) { setError('Enter your email'); return }
    // Placeholder — wire to a real reset endpoint when ready
    setSent(true)
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h1 style={s.title}>Reset password</h1>
        <p style={s.sub}>Enter your email and we'll send reset instructions</p>
        {sent ? (
          <div style={s.sentBox}>
            <p style={s.sentText}>If that email exists, a reset link has been sent.</p>
            <button style={s.btn} onClick={() => navigate('/')}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={submit} style={s.form}>
            <input style={s.input} type="email" placeholder="Email"
              value={email} onChange={e => setEmail(e.target.value)} required />
            {error && <p style={s.error}>{error}</p>}
            <button style={s.btn}>Send reset link</button>
          </form>
        )}
        <div style={s.links}>
          <button style={s.link} onClick={() => navigate('/')}>← Back to sign in</button>
        </div>
      </div>
    </div>
  )
}

const s = {
  wrap:     { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f' },
  card:     { background: '#1a1a1a', padding: '2.5rem', borderRadius: '12px', width: '100%', maxWidth: '380px', border: '1px solid #2a2a2a' },
  title:    { color: '#fff', margin: '0 0 4px', fontSize: '24px', fontWeight: 600 },
  sub:      { color: '#555', margin: '0 0 2rem', fontSize: '14px', lineHeight: 1.5 },
  form:     { display: 'flex', flexDirection: 'column', gap: '12px' },
  input:    { padding: '10px 14px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff', fontSize: '14px' },
  btn:      { padding: '11px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px', width: '100%' },
  error:    { color: '#ff6b6b', fontSize: '13px', margin: 0 },
  sentBox:  { display: 'flex', flexDirection: 'column', gap: '1rem' },
  sentText: { color: '#6bffb8', fontSize: '14px', margin: 0 },
  links:    { marginTop: '1.25rem', textAlign: 'center' },
  link:     { background: 'none', border: 'none', color: '#666', fontSize: '13px', cursor: 'pointer', padding: 0 },
}