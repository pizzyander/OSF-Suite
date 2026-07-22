import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()
  const [status, setStatus] = useState('verifying')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }
    api.verifyEmail(token)
      .then(() => setStatus('done'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        {status === 'verifying' && <p style={s.text}>Verifying your email...</p>}
        {status === 'done' && (
          <>
            <div style={s.checkmark}>✓</div>
            <h1 style={s.title}>Email verified</h1>
            <button style={s.btn} onClick={() => navigate('/')}>Continue</button>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 style={s.title}>Link invalid or expired</h1>
            <p style={s.text}>Log in and request a new verification email from your account settings.</p>
            <button style={s.btn} onClick={() => navigate('/')}>Go to login</button>
          </>
        )}
      </div>
    </div>
  )
}

const s = {
  wrap:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f', padding: '1.5rem' },
  card:  { width: '100%', maxWidth: '380px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '2.5rem', textAlign: 'center' },
  checkmark: { width: '48px', height: '48px', borderRadius: '50%', background: '#6c5ce7', color: '#fff', fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' },
  title: { color: '#fff', fontSize: '20px', fontWeight: 700, margin: '0 0 8px' },
  text:  { color: '#888', fontSize: '14px', lineHeight: 1.6, margin: '0 0 1.5rem' },
  btn:   { width: '100%', padding: '13px', borderRadius: '10px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px' },
}
