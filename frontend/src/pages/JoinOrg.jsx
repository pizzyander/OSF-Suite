import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Building2, Check } from 'lucide-react'
import { api } from '../api'

/**
 * JoinOrg: the page an invite link (/join?token=...) lands on.
 *
 * Handles three situations:
 *  1. Not logged in yet, show a preview of the org, then send them to
 *     Signup/Login while preserving the invite token so we can pick back
 *     up here afterward.
 *  2. Logged in, email matches the invite, accept immediately.
 *  3. Logged in, email does NOT match the invite, clear error, since the
 *     backend enforces this and a mismatched account could otherwise look
 *     like a silent failure.
 */
export default function JoinOrg({ token, onAccepted }) {
  const [params] = useSearchParams()
  const inviteToken = params.get('token')
  const navigate = useNavigate()

  const [preview, setPreview] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | accepting | done | error
  const [error, setError] = useState('')

  useEffect(() => {
    if (!inviteToken) {
      setError('This invite link is missing its token.')
      setStatus('error')
      return
    }
    api.previewInvite(inviteToken)
      .then(data => {
        setPreview(data)
        setStatus('ready')
      })
      .catch(err => {
        setError(err.message)
        setStatus('error')
      })
  }, [inviteToken])

  const handleAccept = async () => {
    setStatus('accepting')
    setError('')
    try {
      const result = await api.acceptInvite(token, inviteToken)
      setStatus('done')
      setTimeout(() => {
        onAccepted?.(result)
        navigate('/onboarding')
      }, 1200)
    } catch (err) {
      setError(err.message)
      setStatus('ready')
    }
  }

  const goToSignup = () => {
    // Preserve the invite token across the auth flow. Signup/Login can
    // read this back out of localStorage once the user has an account,
    // and redirect straight back to /join?token=... to finish accepting.
    localStorage.setItem('osf_pending_invite', inviteToken)
    navigate('/signup')
  }

  if (status === 'loading') {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.skelGroup}>
            <div className="osf-join-skel" style={{ width: '60%', height: '13px', margin: '0 auto 10px' }} />
            <div className="osf-join-skel" style={{ width: '80%', height: '11px', margin: '0 auto' }} />
          </div>
        </div>
        <style>{`
          @keyframes osfJoinShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
          .osf-join-skel {
            border-radius: 4px;
            background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
            background-size: 400% 100%;
            animation: osfJoinShimmer 1.6s ease-in-out infinite;
          }
          @media (prefers-reduced-motion: reduce) { .osf-join-skel { animation: none; } }
        `}</style>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <h1 style={styles.title}>Invite not valid</h1>
          <p style={styles.sub}>{error}</p>
          <button style={styles.btn} onClick={() => navigate('/')}>Go to homepage</button>
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={styles.checkmark}><Check size={24} strokeWidth={3} /></div>
          <h1 style={styles.title}>Welcome to {preview?.org_name}</h1>
          <p style={styles.sub}>Taking you to set up your profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <span style={styles.iconWrap}><Building2 size={22} /></span>
        <h1 style={styles.title}>You've been invited to join</h1>
        <p style={styles.orgName}>{preview?.org_name}</p>
        <p style={styles.sub}>
          as a <strong>{preview?.role}</strong>, invited for <strong>{preview?.email}</strong>
        </p>

        {error && <p style={styles.error}>{error}</p>}

        {token ? (
          <button style={{ ...styles.btn, ...(status === 'accepting' ? styles.btnDisabled : {}) }} onClick={handleAccept} disabled={status === 'accepting'}>
            {status === 'accepting' ? 'Joining...' : 'Accept invite'}
          </button>
        ) : (
          <>
            <p style={styles.hint}>Create an account with {preview?.email} to accept.</p>
            <button style={styles.btn} onClick={goToSignup}>Create account</button>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  wrap:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F6F3', padding: '1.5rem', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  card:      { width: '100%', maxWidth: '420px', background: '#FFFFFF', border: '1px solid #E5E2DB', borderRadius: '16px', padding: '2.75rem', textAlign: 'center', boxShadow: '0 1px 2px rgba(10,26,47,0.04)' },
  iconWrap:  { width: '44px', height: '44px', borderRadius: '11px', background: '#F6ECD9', color: '#8F6423', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' },
  skelGroup: { padding: '0.5rem 0' },
  checkmark: { width: '48px', height: '48px', borderRadius: '50%', background: '#0A1A2F', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' },
  title:     { color: '#0A1A2F', fontSize: '20px', fontWeight: 700, margin: '0 0 4px', fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  orgName:   { color: '#0A1A2F', fontSize: '24px', fontWeight: 700, margin: '0 0 12px', fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  sub:       { color: '#8A8779', fontSize: '14px', lineHeight: 1.6, margin: '0 0 1.5rem' },
  hint:      { color: '#8A8779', fontSize: '13px', margin: '0 0 1rem' },
  error:     { color: '#B3453B', fontSize: '13px', margin: '0 0 1rem' },
  btn:       { width: '100%', padding: '13px', borderRadius: '10px', background: '#0A1A2F', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px', fontFamily: 'inherit' },
  btnDisabled:{ opacity: 0.55, cursor: 'default' },
}
