import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function BillingCallback({ token }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    let attempts = 0
    const poll = async () => {
      attempts += 1
      try {
        const result = await api.billingStatus(token)
        if (result.has_subscription) {
          setStatus('active')
          setTimeout(() => navigate('/'), 1800)
          return
        }
      } catch (err) {
        // ignore and keep polling
      }
      if (attempts < 8) {
        setTimeout(poll, 1500)
      } else {
        setStatus('pending')
      }
    }
    poll()
  }, [token])

  return (
    <div style={s.wrap}>
      <div style={s.card}>
        {status === 'checking' && (
          <>
            <div style={s.spinner} />
            <p style={s.text}>Confirming your trial...</p>
          </>
        )}
        {status === 'active' && (
          <>
            <div style={s.checkmark}>✓</div>
            <h1 style={s.title}>Trial started</h1>
            <p style={s.text}>Taking you to your dashboard...</p>
          </>
        )}
        {status === 'pending' && (
          <>
            <h1 style={s.title}>Almost there</h1>
            <p style={s.text}>
              Your payment was processed but confirmation is taking a moment. Check your email, or
              refresh your dashboard in a minute.
            </p>
            <button style={s.btn} onClick={() => navigate('/')}>Go to dashboard</button>
          </>
        )}
      </div>
    </div>
  )
}

const s = {
  wrap:  { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f', padding: '1.5rem' },
  card:  { width: '100%', maxWidth: '380px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '2.5rem', textAlign: 'center' },
  spinner: { width: '32px', height: '32px', border: '3px solid #2a2a2a', borderTopColor: '#6c5ce7', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1.25rem' },
  checkmark: { width: '48px', height: '48px', borderRadius: '50%', background: '#6c5ce7', color: '#fff', fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' },
  title: { color: '#fff', fontSize: '20px', fontWeight: 700, margin: '0 0 8px' },
  text:  { color: '#888', fontSize: '14px', lineHeight: 1.6, margin: '0 0 1.5rem' },
  btn:   { width: '100%', padding: '13px', borderRadius: '10px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px' },
}
