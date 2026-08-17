import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { Check, MailWarning } from 'lucide-react'
import { api } from '../api'
import OsfLogoMark from '../components/OsfLogoMark'

export default function VerifyEmail() {
  // Was useSearchParams() from react-router-dom — same direct-URL-read
  // pattern used across the rest of the auth family (Signup's ?ref=,
  // JoinOrg's ?token=, ResetPassword's ?token=).
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token'), [])
  const navigate = useNavigate()
  const reduce = useReducedMotion()
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
    <div className="osf-auth">
      <style>{VERIFY_STYLES}</style>
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

          {status === 'verifying' && (
            <>
              <div className="osf-verify-skel-group">
                <div className="osf-verify-skel" style={{ width: '65%', height: '12px', margin: '0 auto 10px' }} />
                <div className="osf-verify-skel" style={{ width: '45%', height: '10px', margin: '0 auto' }} />
              </div>
              <p className="osf-sub">Verifying your email...</p>
            </>
          )}

          {status === 'done' && (
            <>
              <motion.div className="osf-checkmark"
                initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}>
                <Check size={22} strokeWidth={3} />
              </motion.div>
              <h1>Email verified</h1>
              <button className="osf-submit" onClick={() => navigate({ to: '/login' })}>Continue</button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="osf-warn-icon"><MailWarning size={20} /></div>
              <h1>Link invalid or expired</h1>
              <p className="osf-sub">Log in and request a new verification email from your account settings.</p>
              <button className="osf-submit" onClick={() => navigate({ to: '/login' })}>Go to login</button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}

const VERIFY_STYLES = `
  .osf-auth{
    --navy-950:#08172A; --navy-900:#0A1A2F; --navy-700:#1B3A5C;
    --bg:#FCFBF9; --line:#E5E2DB; --line-strong:#D8D4C9;
    --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
    --accent:#C79541; --accent-soft:#F6ECD9; --accent-strong:#8F6423; --teal:#2F9C8E; --danger:#B3453B;
    --ease:cubic-bezier(.22,.61,.36,1);
    min-height:100dvh; display:grid; place-items:center; padding:32px 20px;
    font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--text-body);
    background:var(--bg); position:relative; overflow:hidden;
  }
  .osf-auth *{box-sizing:border-box;}
  .osf-auth h1{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
    margin:0 0 8px;font-size:clamp(20px,3vw,23px);letter-spacing:-.02em;}
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
  .osf-auth-stage{position:relative;z-index:1;width:100%;max-width:380px;}
  .osf-card{position:relative;background:rgba(255,255,255,.82);backdrop-filter:blur(14px);
    border:1px solid var(--line);border-radius:18px;padding:2.75rem;text-align:center;
    box-shadow:0 30px 60px -34px rgba(10,26,47,.45),0 1px 2px rgba(10,26,47,.05);}
  .osf-logo-img{height:32px;width:auto;display:block;margin:0 auto 18px;}

  .osf-checkmark{width:50px;height:50px;border-radius:50%;
    background:linear-gradient(135deg,var(--teal),#3FB6A6);color:#fff;
    display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;
    box-shadow:0 14px 30px -14px rgba(47,156,142,.7);}
  .osf-warn-icon{width:50px;height:50px;border-radius:50%;
    background:rgba(179,69,59,.1);color:var(--danger);
    display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;}

  .osf-sub{color:var(--text-muted);font-size:14px;line-height:1.6;margin:0 0 1.5rem;}

  .osf-verify-skel-group{padding:.25rem 0 .75rem;}
  .osf-verify-skel{border-radius:4px;
    background:linear-gradient(90deg,var(--accent-soft) 25%,#FBF4E6 37%,var(--accent-soft) 63%);
    background-size:400% 100%;animation:osfVerifyShimmer 1.6s ease-in-out infinite;}
  @keyframes osfVerifyShimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}

  .osf-submit{position:relative;overflow:hidden;width:100%;padding:13px;border-radius:10px;border:none;
    background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;font-weight:600;
    cursor:pointer;font-size:15px;font-family:inherit;
    box-shadow:0 16px 30px -18px rgba(10,26,47,.8);
    transition:transform .25s var(--ease),box-shadow .25s var(--ease),opacity .2s var(--ease);}
  .osf-submit::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
    transform:translateX(-140%) skewX(-18deg);}
  .osf-submit:hover:not(:disabled)::after{transition:transform .8s var(--ease);transform:translateX(300%) skewX(-18deg);}
  .osf-submit:hover:not(:disabled){transform:translateY(-2px);
    box-shadow:0 22px 40px -18px rgba(10,26,47,.75),0 0 0 4px rgba(199,149,65,.16);}

  @media (prefers-reduced-motion:reduce){
    .osf-auth-blob{display:none;}
    .osf-verify-skel{animation:none;} .osf-submit:hover{transform:none;}
  }
`
