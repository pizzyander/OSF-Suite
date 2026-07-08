import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const navigate = useNavigate()

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await api.login(email, password)
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
        <h1 style={s.title}>OSF Suite</h1>
        <p style={s.sub}>Sales coaching platform</p>
        <form onSubmit={submit} style={s.form}>
          <input style={s.input} type="email" placeholder="Email"
            value={email} onChange={e => setEmail(e.target.value)} required />
          <input style={s.input} type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p style={s.error}>{error}</p>}
          <button style={s.btn} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div style={s.links}>
          <button style={s.link} onClick={() => navigate('/signup')}>
            Create account
          </button>
          <button style={s.link} onClick={() => navigate('/forgot')}>
            Forgot password?
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
  links: { display: 'flex', justifyContent: 'space-between', marginTop: '1.25rem' },
  link:  { background: 'none', border: 'none', color: '#666', fontSize: '13px', cursor: 'pointer', padding: 0 },
}