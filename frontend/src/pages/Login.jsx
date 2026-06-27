import { useState } from 'react'
import { api } from '../api'

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await api.login(email, password)
      onLogin(data.access_token)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h1 style={styles.title}>OSF Suite</h1>
        <p style={styles.sub}>Sales coaching platform</p>
        <form onSubmit={submit} style={styles.form}>
          <input style={styles.input} type="email"    placeholder="Email"
            value={email}    onChange={e => setEmail(e.target.value)}    required />
          <input style={styles.input} type="password" placeholder="Password"
            value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  wrap:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f' },
  card:  { background: '#1a1a1a', padding: '2.5rem', borderRadius: '12px', width: '100%', maxWidth: '380px', border: '1px solid #2a2a2a' },
  title: { color: '#fff', margin: '0 0 4px', fontSize: '24px', fontWeight: 600 },
  sub:   { color: '#666', margin: '0 0 2rem', fontSize: '14px' },
  form:  { display: 'flex', flexDirection: 'column', gap: '12px' },
  input: { padding: '10px 14px', borderRadius: '8px', border: '1px solid #333', background: '#111', color: '#fff', fontSize: '14px' },
  btn:   { padding: '11px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px' },
  error: { color: '#ff6b6b', fontSize: '13px', margin: 0 }
}