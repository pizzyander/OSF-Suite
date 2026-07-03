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
      onLogin(data.access_token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <h1 style={s.title}>Create account</h1>
        <p style={s.sub}>Start coaching your sales team</p>
        <form onSubmit={submit} style={s.form}>
          <input style={s.input} type="text"     placeholder="Full name"
            value={name}     onChange={e => setName(e.target.value)}     required />
          <input style={s.input} type="email"    placeholder="Email"
            value={email}    onChange={e => setEmail(e.target.value)}    required />
          <input style={s.input} type="password" placeholder="Password (min 8 chars)"
            value={password} onChange={e => setPassword(e.target.value)} required />
          <input style={s.input} type="password" placeholder="Confirm password"
            value={confirm}  onChange={e => setConfirm(e.target.value)}  required />
          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} disabled={loading}>
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
  wrap:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f' },
  card:  { background: '#1a1a1a', padding: '2.5rem', borderRadius: '12px', width: '100%', maxWidth: '380px', border: '1px solid #2a2a2a' },
  title: { color: '#fff', margin: '0 0 4px', fontSize: '24px', fontWeight: 600 },
  sub:   { color: '#555', margin: '0 0 2rem', fontSize: '14px' },
  form:  { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff', fontSize: '14px' },
  btn:   { padding: '11px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px' },
  error: { color: '#ff6b6b', fontSize: '13px', margin: 0 },
  links: { marginTop: '1.25rem', textAlign: 'center' },
  link:  { background: 'none', border: 'none', color: '#666', fontSize: '13px', cursor: 'pointer', padding: 0 },
}