import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
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
          setTimeout(() => navigate({ to: '/' }), 1800)
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
            <div style={s.skelGroup}>
              <div className="osf-callback-skel" style={{ width: '55%', height: '11px' }} />
              <div className="osf-callback-skel" style={{ width: '75%', height: '11px' }} />
            </div>
            {/* CHANGED: was "Confirming your trial..." — hard paywall
                means this is now a real payment being confirmed, not a
                trial activation. */}
            <p style={s.text}>Confirming your payment...</p>
          </>
        )}
        {status === 'active' && (
          <>
            <div style={s.checkmark}><Check size={24} strokeWidth={3} /></div>
            {/* CHANGED: was "Trial started" */}
            <h1 style={s.title}>Subscription active</h1>
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
            <button style={s.btn} onClick={() => navigate({ to: '/' })}>Go to dashboard</button>
          </>
        )}
      </div>

      <style>{`
        @keyframes osfCallbackShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
        .osf-callback-skel {
          border-radius: 4px; margin: 0 auto 8px;
          background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
          background-size: 400% 100%;
          animation: osfCallbackShimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .osf-callback-skel { animation: none; } }
      `}</style>
    </div>
  )
}

const s = {
  wrap:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F3', padding: '1.5rem', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  card:      { width: '100%', maxWidth: '380px', background: '#FFFFFF', border: '1px solid #E5E2DB', borderRadius: '16px', padding: '2.75rem', textAlign: 'center', boxShadow: '0 1px 2px rgba(10,26,47,0.04)' },
  skelGroup: { display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.25rem' },
  checkmark: { width: '48px', height: '48px', borderRadius: '50%', background: '#0A1A2F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' },
  title:     { color: '#0A1A2F', fontSize: '20px', fontWeight: 700, margin: '0 0 8px', fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  text:      { color: '#8A8779', fontSize: '14px', lineHeight: 1.6, margin: '0 0 1.5rem' },
  btn:       { width: '100%', padding: '13px', borderRadius: '10px', background: '#0A1A2F', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px', fontFamily: 'inherit' },
}
