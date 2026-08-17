import { useState, useMemo } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { Check, Loader2 } from 'lucide-react'
import { api } from '../api'
import { validatePassword, passwordStrength } from '../validation'
import OsfLogoMark from '../components/OsfLogoMark'

export default function ResetPassword() {
  // Was useSearchParams() from react-router-dom — same direct-URL-read y
  // pattern used for Signup's ?ref= and JoinOrg's ?token=.
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token'), [])
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)

  const strength = passwordStrength(password)

  const submit = async (e) => {
    e.preventDefault()
    const pwError = validatePassword(password)
    if (pwError) { setError(pwError); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (!token) { setError('This reset link is missing its token.'); return }

    setLoading(true)
    setError('')
    try {
      await api.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="osf-auth">
      <style>{RESET_STYLES}</style>
      <div className="osf-auth-aurora" aria-hidden="true">
        <motion.div className="osf-auth-blob a"
          animate={reduce ? undefined : { x: [0, 30, -12, 0], y: [0, -22, 16, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="osf-auth-blob b"
          animate={reduce ? undefined : { x: [0, -26, 18, 0], y: [0, 20, -14, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }} />
      </div>
      <div className="osf-auth-grid" aria-hidden="true" />

      <div className="osf-auth-stage">
        <motion.div className="osf-card"
          initial={{ opacity: 0, y: 26, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}>

          <OsfLogoMark className="osf-logo-img" />

          {!token && (
            <>
              <h1>Link invalid</h1>
              <p className="osf-sub">This password reset link is missing its token. Request a new one.</p>
              <button className="osf-submit" onClick={() => navigate({ to: '/forgot' })}>Request new link</button>
            </>
          )}

          {token && done && (
            <>
              <motion.div className="osf-checkmark"
                initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}>
                <Check size={22} strokeWidth={3} />
              </motion.div>
              <h1>Password reset</h1>
              <p className="osf-sub">You can now log in with your new password.</p>
              <button className="osf-submit" onClick={() => navigate({ to: '/login' })}>Go to sign in</button>
            </>
          )}

          {token && !done && (
            <>
              <h1>Set a new password</h1>
              <p className="osf-sub">Choose a new password for your account.</p>
              <form onSubmit={submit} className="osf-form" noValidate>
                <div className="osf-field">
                  <label className="osf-label">New password</label>
                  <input
                    className="osf-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  {password && (
                    <p className="osf-strength" style={{ color: strengthColor(strength.score) }}>{strength.label}</p>
                  )}
                </div>
                <div className="osf-field">
                  <label className="osf-label">Confirm new password</label>
                  <input
                    className="osf-input"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Re-enter your new password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <motion.p className="osf-error" role="alert"
                    initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0, x: reduce ? 0 : [0, -5, 5, -3, 0] }}
                    transition={{ duration: 0.4 }}>
                    {error}
                  </motion.p>
                )}

                <button className="osf-submit" type="submit" disabled={loading}>
                  {loading ? (<><Loader2 size={16} className="osf-spin" /> Resetting…</>) : 'Reset password'}
                </button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}

function strengthColor(score) {
  if (score <= 1) return '#B3453B'
  if (score <= 3) return '#8F6423'
  return '#3F6249'
}

const RESET_STYLES = `
  .osf-auth{
    --navy-950:#08172A; --navy-900:#0A1A2F; --navy-700:#1B3A5C;
    --bg:#FCFBF9; --line:#E5E2DB; --line-strong:#D8D4C9;
    --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
    --accent:#C79541; --accent-strong:#8F6423; --teal:#2F9C8E; --danger:#B3453B;
    --ease:cubic-bezier(.22,.61,.36,1);
    min-height:100dvh; display:grid; place-items:center; padding:32px 20px;
    font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--text-body);
    background:var(--bg); position:relative; overflow:hidden;
  }
  .osf-auth *{box-sizing:border-box;}
  .osf-auth h1{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
    margin:0 0 4px;font-size:clamp(22px,3.2vw,26px);letter-spacing:-.02em;text-align:center;}
  .osf-auth-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
  .osf-auth-blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55;}
  .osf-auth-blob.a{width:500px;height:500px;top:-190px;right:-120px;
    background:radial-gradient(circle,rgba(199,149,65,.45),transparent 70%);}
  .osf-auth-blob.b{width:440px;height:440px;bottom:-190px;left:-130px;
    background:radial-gradient(circle,rgba(47,156,142,.32),transparent 70%);}
  .osf-auth-grid{position:absolute;inset:0;pointer-events:none;opacity:.5;
    background-image:linear-gradient(rgba(10,26,47,.045) 1px,transparent 1px),
      linear-gradient(90deg,rgba(10,26,47,.045) 1px,transparent 1px);
    background-size:46px 46px;
    mask-image:radial-gradient(circle at 50% 40%,#000,transparent 72%);}
  .osf-auth-stage{position:relative;z-index:1;width:100%;max-width:400px;}
  .osf-card{position:relative;background:rgba(255,255,255,.82);backdrop-filter:blur(14px);
    border:1px solid var(--line);border-radius:18px;padding:34px 30px 28px;text-align:center;
    box-shadow:0 30px 60px -34px rgba(10,26,47,.45),0 1px 2px rgba(10,26,47,.05);}
  .osf-logo-img{height:32px;width:auto;display:block;margin:0 auto 18px;}
  .osf-checkmark{width:50px;height:50px;border-radius:50%;
    background:linear-gradient(135deg,var(--teal),#3FB6A6);color:#fff;
    display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;
    box-shadow:0 14px 30px -14px rgba(47,156,142,.7);}
  .osf-sub{color:var(--text-muted);margin:0 0 1.5rem;font-size:14px;line-height:1.55;}
  .osf-form{display:flex;flex-direction:column;gap:14px;text-align:left;}
  .osf-field{display:flex;flex-direction:column;gap:6px;}
  .osf-label{color:var(--navy-700);font-size:12.5px;font-weight:600;letter-spacing:.01em;}
  .osf-input{width:100%;padding:12px 13px;border-radius:10px;border:1px solid var(--line);
    background:#fff;color:var(--text);font-size:14px;font-family:inherit;
    transition:border-color .25s var(--ease),box-shadow .25s var(--ease),transform .25s var(--ease);}
  .osf-input::placeholder{color:#B6B2A6;}
  .osf-input:hover{border-color:var(--line-strong);}
  .osf-input:focus{outline:none;border-color:var(--accent);
    box-shadow:0 0 0 4px rgba(199,149,65,.16);transform:translateY(-1px);}
  .osf-strength{font-size:12px;margin:6px 0 0;font-weight:600;}
  .osf-error{display:flex;gap:8px;align-items:flex-start;color:var(--danger);font-size:13px;margin:0;
    background:rgba(179,69,59,.07);border:1px solid rgba(179,69,59,.2);padding:9px 11px;border-radius:9px;}
  .osf-submit{position:relative;overflow:hidden;margin-top:6px;padding:13px;border-radius:10px;border:none;
    background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;font-weight:600;
    font-size:14.5px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;
    justify-content:center;gap:8px;width:100%;
    box-shadow:0 16px 30px -18px rgba(10,26,47,.8);
    transition:transform .25s var(--ease),box-shadow .25s var(--ease),opacity .2s var(--ease);}
  .osf-submit::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
    transform:translateX(-140%) skewX(-18deg);}
  .osf-submit:hover:not(:disabled)::after{transition:transform .8s var(--ease);transform:translateX(300%) skewX(-18deg);}
  .osf-submit:hover:not(:disabled){transform:translateY(-2px);
    box-shadow:0 22px 40px -18px rgba(10,26,47,.75),0 0 0 4px rgba(199,149,65,.16);}
  .osf-submit:disabled{opacity:.6;cursor:default;}
  .osf-spin{animation:osf-rot 1s linear infinite;}
  @keyframes osf-rot{to{transform:rotate(360deg);}}
  @media (prefers-reduced-motion:reduce){
    .osf-auth-blob{display:none;}
    .osf-input:focus,.osf-submit:hover{transform:none;}
  }
`
