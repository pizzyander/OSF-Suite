import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../api'
import { validateEmail } from '../validation'

export default function ForgotPassword() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    const emailError = validateEmail(email)
    if (emailError) { setError(emailError); return }
    setLoading(true)
    setError('')
    try {
      await api.forgotPassword(email)
      // The backend always returns the same success message whether or
      // not the account exists, see forgot_password() in
      // verification_routes.py, so this branch runs regardless, by
      // design, rather than confirming/denying a real account exists.
      setSent(true)
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
        <h1 style={s.title}>Reset your password</h1>
        <p style={s.sub}>Enter your email and we'll send reset instructions.</p>
        {sent ? (
          <div style={s.sentBox}>
            <div style={s.sentCard}>
              <p style={s.sentText}>If that email exists, a reset link has been sent.</p>
            </div>
            <button style={s.btn} onClick={() => navigate('/')}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={submit} style={s.form}>
            <div style={s.field}>
              <label style={s.label}>Email</label>
              <input style={s.input} type="email" placeholder="you@company.com"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            {error && <p style={s.error}>{error}</p>}
            <button style={{ ...s.btn, ...(loading ? s.btnDisabled : {}) }} disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}
        <div style={s.links}>
          <button style={s.link} onClick={() => navigate('/')}>
            <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Back to sign in
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  wrap:     { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F3', padding: '1.5rem', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  card:     { background: '#FFFFFF', padding: '2.75rem 2.25rem', borderRadius: '14px', width: '100%', maxWidth: '380px', border: '1px solid #E5E2DB', boxShadow: '0 1px 2px rgba(10,26,47,0.04)' },
  logo:     { fontFamily: "'Space Grotesk', 'Inter', sans-serif", color: '#0A1A2F', fontSize: '18px', fontWeight: 700, margin: '0 0 20px' },
  logoAccent: { color: '#8F6423' },
  title:    { color: '#0A1A2F', margin: '0 0 8px', fontSize: '22px', fontWeight: 600, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  sub:      { color: '#8A8779', margin: '0 0 2rem', fontSize: '14px', lineHeight: 1.5 },
  form:     { display: 'flex', flexDirection: 'column', gap: '16px' },
  field:    { display: 'flex', flexDirection: 'column', gap: '6px' },
  label:    { color: '#1B3A5C', fontSize: '12.5px', fontWeight: 600 },
  input:    { padding: '11px 13px', borderRadius: '8px', border: '1px solid #E5E2DB', background: '#FFFFFF', color: '#2B2A26', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box' },
  btn:      { padding: '12.5px', borderRadius: '8px', background: '#0A1A2F', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14.5px', width: '100%', fontFamily: 'inherit' },
  btnDisabled: { opacity: 0.55, cursor: 'default' },
  error:    { color: '#B3453B', fontSize: '13px', margin: 0 },
  sentBox:  { display: 'flex', flexDirection: 'column', gap: '1rem' },
  sentCard: { background: '#F1F5F1', border: '1px solid #D9E4DA', borderRadius: '8px', padding: '14px 16px' },
  sentText: { color: '#3F6249', fontSize: '13.5px', margin: 0, lineHeight: 1.5 },
  links:    { marginTop: '1.5rem', textAlign: 'center' },
  link:     { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#8A8779', fontSize: '13px', cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
}
