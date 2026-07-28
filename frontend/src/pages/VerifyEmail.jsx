import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
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
        {status === 'verifying' && (
          <>
            <div style={s.skelGroup}>
              <div className="osf-verify-skel" style={{ width: '65%', height: '12px', margin: '0 auto 10px' }} />
              <div className="osf-verify-skel" style={{ width: '45%', height: '10px', margin: '0 auto' }} />
            </div>
            <p style={s.text}>Verifying your email...</p>
          </>
        )}
        {status === 'done' && (
          <>
            <div style={s.checkmark}><Check size={24} strokeWidth={3} /></div>
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

      <style>{`
        @keyframes osfVerifyShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
        .osf-verify-skel {
          border-radius: 4px;
          background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
          background-size: 400% 100%;
          animation: osfVerifyShimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .osf-verify-skel { animation: none; } }
      `}</style>
    </div>
  )
}

const s = {
  wrap:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F3', padding: '1.5rem', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  card:      { width: '100%', maxWidth: '380px', background: '#FFFFFF', border: '1px solid #E5E2DB', borderRadius: '16px', padding: '2.75rem', textAlign: 'center', boxShadow: '0 1px 2px rgba(10,26,47,0.04)' },
  skelGroup: { padding: '0.25rem 0 0.75rem' },
  checkmark: { width: '48px', height: '48px', borderRadius: '50%', background: '#0A1A2F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' },
  title:     { color: '#0A1A2F', fontSize: '20px', fontWeight: 700, margin: '0 0 8px', fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  text:      { color: '#8A8779', fontSize: '14px', lineHeight: 1.6, margin: '0 0 1.5rem' },
  btn:       { width: '100%', padding: '13px', borderRadius: '10px', background: '#0A1A2F', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px', fontFamily: 'inherit' },
}
