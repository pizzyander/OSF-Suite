import { useState, useRef } from 'react'
import { useNavigate, Link } from '@tanstack/react-router'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react'
import { api } from '../api'

export default function Login({ onLogin }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  // --- 3D tilt on the card, identical treatment to Signup's card ---
  const cardRef = useRef(null)
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 160, damping: 18 })
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-8, 8]), { stiffness: 160, damping: 18 })

  const onPointerMove = (e) => {
    if (reduce) return
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width - 0.5)
    my.set((e.clientY - r.top) / r.height - 0.5)
    el.style.setProperty('--px', `${((e.clientX - r.left) / r.width) * 100}%`)
    el.style.setProperty('--py', `${((e.clientY - r.top) / r.height) * 100}%`)
  }
  const onPointerLeave = () => { mx.set(0); my.set(0) }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await api.login(email, password)
      await onLogin(data)
      navigate({ to: '/' })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="osf-auth">
      <style>{`
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
          margin:0 0 8px;font-size:clamp(24px,3.4vw,30px);letter-spacing:-.02em;}
        .osf-auth-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
        .osf-auth-blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.55;}
        .osf-auth-blob.a{width:520px;height:520px;top:-200px;right:-120px;
          background:radial-gradient(circle,rgba(199,149,65,.45),transparent 70%);}
        .osf-auth-blob.b{width:460px;height:460px;bottom:-200px;left:-140px;
          background:radial-gradient(circle,rgba(47,156,142,.32),transparent 70%);}
        .osf-auth-grid{position:absolute;inset:0;pointer-events:none;opacity:.5;
          background-image:linear-gradient(rgba(10,26,47,.045) 1px,transparent 1px),
            linear-gradient(90deg,rgba(10,26,47,.045) 1px,transparent 1px);
          background-size:46px 46px;
          mask-image:radial-gradient(circle at 50% 40%,#000,transparent 72%);}
        .osf-auth-stage{position:relative;z-index:1;width:100%;max-width:400px;perspective:1200px;}
        .osf-card{
          position:relative;background:rgba(255,255,255,.82);backdrop-filter:blur(14px);
          border:1px solid var(--line);border-radius:18px;padding:34px 30px 28px;
          box-shadow:0 30px 60px -34px rgba(10,26,47,.45),0 1px 2px rgba(10,26,47,.05);
          transform-style:preserve-3d;
        }
        .osf-card::before{content:"";position:absolute;inset:-1px;border-radius:19px;pointer-events:none;
          background:radial-gradient(340px circle at var(--px,50%) var(--py,0%),rgba(199,149,65,.28),transparent 60%);
          opacity:0;transition:opacity .4s var(--ease);
          -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
          -webkit-mask-composite:xor;mask-composite:exclude;padding:1px;}
        .osf-card:hover::before{opacity:1;}
        .osf-logo-img{height:32px;width:auto;display:block;margin-bottom:18px;}
        .osf-sub{color:var(--text-muted);font-size:14px;line-height:1.55;margin:0 0 24px;}
        .osf-form{display:flex;flex-direction:column;gap:14px;}
        .osf-field{display:flex;flex-direction:column;gap:6px;}
        .osf-label{color:var(--navy-700);font-size:12.5px;font-weight:600;letter-spacing:.01em;}
        .osf-input{width:100%;padding:12px 13px;border-radius:10px;border:1px solid var(--line);
          background:#fff;color:var(--text);font-size:14px;font-family:inherit;
          transition:border-color .25s var(--ease),box-shadow .25s var(--ease),transform .25s var(--ease);}
        .osf-input::placeholder{color:#B6B2A6;}
        .osf-input:hover{border-color:var(--line-strong);}
        .osf-input:focus{outline:none;border-color:var(--accent);
          box-shadow:0 0 0 4px rgba(199,149,65,.16);transform:translateY(-1px);}
        .osf-error{display:flex;gap:8px;align-items:flex-start;color:var(--danger);font-size:13px;margin:0;
          background:rgba(179,69,59,.07);border:1px solid rgba(179,69,59,.2);padding:9px 11px;border-radius:9px;}
        .osf-submit{position:relative;overflow:hidden;margin-top:6px;padding:13px;border-radius:10px;border:none;
          background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;font-weight:600;
          font-size:14.5px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;
          justify-content:center;gap:8px;
          box-shadow:0 16px 30px -18px rgba(10,26,47,.8);
          transition:transform .25s var(--ease),box-shadow .25s var(--ease),opacity .2s var(--ease);}
        .osf-submit::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
          transform:translateX(-140%) skewX(-18deg);}
        .osf-submit:hover:not(:disabled)::after{transition:transform .8s var(--ease);transform:translateX(300%) skewX(-18deg);}
        .osf-submit:hover:not(:disabled){transform:translateY(-2px);
          box-shadow:0 22px 40px -18px rgba(10,26,47,.75),0 0 0 4px rgba(199,149,65,.16);}
        .osf-submit:active:not(:disabled){transform:translateY(0) scale(.99);}
        .osf-submit:disabled{opacity:.6;cursor:default;}
        .osf-spin{animation:osf-rot 1s linear infinite;}
        @keyframes osf-rot{to{transform:rotate(360deg);}}
        .osf-links{margin-top:22px;display:flex;justify-content:space-between;align-items:center;}
        .osf-link{background:none;border:none;color:var(--text-muted);font-size:13px;cursor:pointer;
          padding:0;font-family:inherit;position:relative;transition:color .25s var(--ease);
          text-decoration:none;display:inline-block;}
        .osf-link::after{content:"";position:absolute;left:0;bottom:-3px;width:100%;height:1px;
          background:var(--accent);transform:scaleX(0);transform-origin:right;
          transition:transform .3s var(--ease);}
        .osf-link:hover{color:var(--navy-900);}
        .osf-link:hover::after{transform:scaleX(1);transform-origin:left;}
        .osf-trust{margin-top:16px;display:flex;align-items:center;justify-content:center;gap:6px;
          color:var(--text-muted);font-size:11.5px;}
        @media (prefers-reduced-motion:reduce){
          .osf-auth-blob{display:none;}
          .osf-input:focus,.osf-submit:hover{transform:none;}
        }
      `}</style>

      <div className="osf-auth-aurora" aria-hidden="true">
        <motion.div
          className="osf-auth-blob a"
          animate={reduce ? undefined : { x: [0, 30, -12, 0], y: [0, -22, 16, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="osf-auth-blob b"
          animate={reduce ? undefined : { x: [0, -26, 18, 0], y: [0, 20, -14, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="osf-auth-grid" aria-hidden="true" />

      <div className="osf-auth-stage">
        <motion.div
          ref={cardRef}
          className="osf-card"
          style={reduce ? undefined : { rotateX: rx, rotateY: ry }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
          initial={{ opacity: 0, y: 26, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
        >
          <img src="/logo-mark.png" alt="OSF-Suite" className="osf-logo-img" />

          <h1>Welcome back</h1>
          <p className="osf-sub">Sign in to your sales coaching workspace.</p>

          <form className="osf-form" onSubmit={submit} noValidate>
            <div className="osf-field">
              <label className="osf-label">Email</label>
              <input
                className="osf-input"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="osf-field">
              <label className="osf-label">Password</label>
              <input
                className="osf-input"
                type="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <motion.p
                className="osf-error"
                role="alert"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0, x: reduce ? 0 : [0, -5, 5, -3, 0] }}
                transition={{ duration: 0.4 }}
              >
                {error}
              </motion.p>
            )}

            <button className="osf-submit" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="osf-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="osf-links">
            <Link to="/signup" className="osf-link">Create account</Link>
            <Link to="/forgot" className="osf-link">Forgot password?</Link>
          </div>

          <div className="osf-trust">
            <ShieldCheck size={13} /> Encrypted in transit · SOC 2 aligned
          </div>
        </motion.div>
      </div>
    </div>
  )
}
