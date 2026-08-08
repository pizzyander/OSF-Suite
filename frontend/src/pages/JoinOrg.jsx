import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
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
  // Was useSearchParams() from react-router-dom — read directly off the
  // URL instead, same pattern used for Signup's ?ref= capture, avoids
  // needing search-param schema validation set up at the route level.
  const inviteToken = useMemo(() => new URLSearchParams(window.location.search).get('token'), [])
  const navigate = useNavigate()
  const reduce = useReducedMotion()

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
        navigate({ to: '/onboarding' })
      }, 1200)
    } catch (err) {
      setError(err.message)
      setStatus('ready')
    }
  }

  const goToSignup = () => {
    localStorage.setItem('osf_pending_invite', inviteToken)
    navigate({ to: '/signup' })
  }

  return (
    <div className="osf-join">
      <style>{JOIN_STYLES}</style>
      <div className="osf-join-aurora" aria-hidden="true">
        <motion.div className="osf-join-blob a"
          animate={reduce ? undefined : { x: [0, 28, -12, 0], y: [0, -20, 15, 0] }}
          transition={{ duration: 23, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="osf-join-blob b"
          animate={reduce ? undefined : { x: [0, -24, 18, 0], y: [0, 18, -13, 0] }}
          transition={{ duration: 27, repeat: Infinity, ease: 'easeInOut' }} />
      </div>
      <div className="osf-join-grid" aria-hidden="true" />

      <div className="osf-join-stage">
        <motion.div className="osf-join-card"
          initial={{ opacity: 0, y: 26, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}>

          {status === 'loading' && (
            <div className="osf-join-skel-group">
              <div className="osf-join-skel" style={{ width: '60%', height: '13px', margin: '0 auto 10px' }} />
              <div className="osf-join-skel" style={{ width: '80%', height: '11px', margin: '0 auto' }} />
            </div>
          )}

          {status === 'error' && (
            <>
              <h1 className="osf-join-title">Invite not valid</h1>
              <p className="osf-join-sub">{error}</p>
              <button className="osf-join-btn" onClick={() => navigate({ to: '/' })}>Go to homepage</button>
            </>
          )}

          {status === 'done' && (
            <>
              <motion.div className="osf-join-checkmark"
                initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}>
                <Check size={22} strokeWidth={3} />
              </motion.div>
              <h1 className="osf-join-title">Welcome to {preview?.org_name}</h1>
              <p className="osf-join-sub">Taking you to set up your profile...</p>
            </>
          )}

          {(status === 'ready' || status === 'accepting') && (
            <>
              <span className="osf-join-icon-wrap"><Building2 size={22} /></span>
              <h1 className="osf-join-title">You've been invited to join</h1>
              <p className="osf-join-org-name">{preview?.org_name}</p>
              <p className="osf-join-sub">
                as a <strong>{preview?.role}</strong>, invited for <strong>{preview?.email}</strong>
              </p>

              {error && <p className="osf-join-error">{error}</p>}

              {token ? (
                <button className="osf-join-btn" onClick={handleAccept} disabled={status === 'accepting'}>
                  {status === 'accepting' ? 'Joining...' : 'Accept invite'}
                </button>
              ) : (
                <>
                  <p className="osf-join-hint">Create an account with {preview?.email} to accept.</p>
                  <button className="osf-join-btn" onClick={goToSignup}>Create account</button>
                </>
              )}
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}

const JOIN_STYLES = `
  .osf-join{
    --navy-950:#08172A; --navy-900:#0A1A2F; --navy-700:#1B3A5C;
    --bg:#FCFBF9; --line:#E5E2DB; --line-strong:#D8D4C9;
    --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
    --accent:#C79541; --accent-soft:#F6ECD9; --accent-strong:#8F6423; --teal:#2F9C8E; --danger:#B3453B;
    --ease:cubic-bezier(.22,.61,.36,1);
    min-height:100dvh; display:grid; place-items:center; padding:32px 20px;
    font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--text-body);
    background:var(--bg); position:relative; overflow:hidden;
  }
  .osf-join *{box-sizing:border-box;}
  .osf-join-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
  .osf-join-blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.5;}
  .osf-join-blob.a{width:500px;height:500px;top:-190px;right:-120px;
    background:radial-gradient(circle,rgba(199,149,65,.42),transparent 70%);}
  .osf-join-blob.b{width:440px;height:440px;bottom:-190px;left:-130px;
    background:radial-gradient(circle,rgba(47,156,142,.3),transparent 70%);}
  .osf-join-grid{position:absolute;inset:0;pointer-events:none;opacity:.5;
    background-image:linear-gradient(rgba(10,26,47,.045) 1px,transparent 1px),
      linear-gradient(90deg,rgba(10,26,47,.045) 1px,transparent 1px);
    background-size:46px 46px;
    mask-image:radial-gradient(circle at 50% 40%,#000,transparent 72%);}
  .osf-join-stage{position:relative;z-index:1;width:100%;max-width:420px;}
  .osf-join-card{position:relative;background:rgba(255,255,255,.85);backdrop-filter:blur(14px);
    border:1px solid var(--line);border-radius:18px;padding:2.75rem;text-align:center;
    box-shadow:0 30px 60px -34px rgba(10,26,47,.45),0 1px 2px rgba(10,26,47,.05);}

  .osf-join-icon-wrap{width:46px;height:46px;border-radius:13px;
    background:linear-gradient(135deg,var(--accent-soft),#FBF3E3);color:var(--accent-strong);
    display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;}
  .osf-join-checkmark{width:50px;height:50px;border-radius:50%;
    background:linear-gradient(135deg,var(--teal),#3FB6A6);color:#fff;
    display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;
    box-shadow:0 14px 30px -14px rgba(47,156,142,.7);}
  .osf-join-title{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
    font-size:20px;font-weight:700;margin:0 0 4px;letter-spacing:-.02em;}
  .osf-join-org-name{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
    font-size:25px;font-weight:700;margin:0 0 12px;letter-spacing:-.02em;}
  .osf-join-sub{color:var(--text-muted);font-size:14px;line-height:1.6;margin:0 0 1.5rem;}
  .osf-join-hint{color:var(--text-muted);font-size:13px;margin:0 0 1rem;}
  .osf-join-error{color:var(--danger);font-size:13px;margin:0 0 1rem;
    background:rgba(179,69,59,.07);border:1px solid rgba(179,69,59,.2);padding:9px 11px;border-radius:9px;}

  .osf-join-btn{position:relative;overflow:hidden;width:100%;padding:13px;border-radius:10px;border:none;
    background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;font-weight:600;
    cursor:pointer;font-size:15px;font-family:inherit;
    box-shadow:0 16px 30px -18px rgba(10,26,47,.8);
    transition:transform .25s var(--ease),box-shadow .25s var(--ease),opacity .2s var(--ease);}
  .osf-join-btn::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
    transform:translateX(-140%) skewX(-18deg);}
  .osf-join-btn:hover:not(:disabled)::after{transition:transform .8s var(--ease);transform:translateX(300%) skewX(-18deg);}
  .osf-join-btn:hover:not(:disabled){transform:translateY(-2px);
    box-shadow:0 22px 40px -18px rgba(10,26,47,.75),0 0 0 4px rgba(199,149,65,.16);}
  .osf-join-btn:disabled{opacity:.6;cursor:default;}

  .osf-join-skel-group{padding:.5rem 0;}
  .osf-join-skel{border-radius:4px;
    background:linear-gradient(90deg,var(--accent-soft) 25%,#FBF4E6 37%,var(--accent-soft) 63%);
    background-size:400% 100%;animation:osfJoinShimmer 1.6s ease-in-out infinite;}
  @keyframes osfJoinShimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}
  @media (prefers-reduced-motion:reduce){ .osf-join-blob{display:none;} .osf-join-skel{animation:none;} }
`
