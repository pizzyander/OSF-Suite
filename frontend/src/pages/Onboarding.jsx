import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { User, Building2, FileText, ArrowLeft, Check, Eye, EyeOff, Loader2 } from 'lucide-react'
import { api } from '../api'

function detectLocale() {
  const locale = navigator.language || 'en-US'
  const languageNames = new Intl.DisplayNames([locale], { type: 'language' })
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' })
  const [lang, region] = locale.split('-')
  return {
    language: languageNames.of(lang) || 'English',
    country: region ? (regionNames.of(region) || '') : '',
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function strengthOf(pw) {
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return Math.min(score, 4)
}
const STRENGTH_LABEL = ['Too short', 'Weak', 'Fair', 'Strong', 'Excellent']
const STRENGTH_COLOR = ['#B3453B', '#C77A41', '#C79541', '#2F9C8E', '#2F9C8E']

const SALES_METHODOLOGIES = ['MEDDIC', 'SPIN', 'Challenger', 'Sandler', 'Consultative', 'Other / None']
const PRIMARY_GOALS = [
  { value: 'close_more', label: 'Close more deals' },
  { value: 'objections', label: 'Handle objections better' },
  { value: 'discovery',  label: 'Improve discovery calls' },
  { value: 'coach_team', label: 'Coach my team' },
]

const EASE = [0.22, 0.61, 0.36, 1]

export default function Onboarding({ onLogin, onComplete }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [step, setStep] = useState('account_type')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // The session token this component uses for every authenticated call
  // it makes after account creation. Deliberately NOT read from
  // authContext here — onLogin() updates that context asynchronously,
  // and reading it back immediately in the same function risks a stale
  // value. Keeping our own copy, set once at the moment api.register
  // succeeds, means every subsequent call in this file uses a value we
  // know is correct, regardless of React's render timing.
  const [token, setToken] = useState(null)

  const detected = detectLocale()

  const [accountType, setAccountType] = useState(null)
  const [orgName, setOrgName] = useState('')

  const [fields, setFields] = useState({
    country: detected.country,
    language: detected.language,
    job_title: '',
    role_summary: '',
    company_name: '',
    what_we_sell: '',
    sales_methodology: '',
    primary_goals: [], // multiselect — was a single string before
  })

  const [contextText, setContextText] = useState('')
  const [contextFile, setContextFile] = useState(null)

  const [inviteEmails, setInviteEmails] = useState([''])
  const [isOrgAdmin, setIsOrgAdmin] = useState(false)

  // -- Account-creation fields (formerly Signup.jsx) ------------------------
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const score = useMemo(() => strengthOf(password), [password])
  const matches = confirm.length > 0 && confirm === password

  // Referral code from a shared link — /onboarding?ref=X7K2P9Q — read
  // once on mount, forwarded to api.register at the very end.
  const referralCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('ref') || null
  }, [])

  // Legal doc versions, for consent tracking at registration — same
  // pattern as the standalone legal pages, same fallback if the fetch
  // hasn't landed yet.
  const [legalMeta, setLegalMeta] = useState(null)
  useMemo(() => { api.getLegalMeta().then(setLegalMeta).catch(() => {}) }, [])

  const updateField = (key, value) => setFields(prev => ({ ...prev, [key]: value }))
  const toggleGoal = (value) => {
    setFields(prev => ({
      ...prev,
      primary_goals: prev.primary_goals.includes(value)
        ? prev.primary_goals.filter(g => g !== value)
        : [...prev.primary_goals, value],
    }))
  }

  const getFlowSequence = () => {
    const seq = ['account_type']
    if (accountType === 'organization') seq.push('org_name')
    seq.push('profile_locale', 'profile_job_title', 'profile_role_summary')
    if (accountType === 'individual') seq.push('profile_company')
    seq.push('profile_what_we_sell', 'profile_methodology', 'profile_goal', 'context', 'account_create')
    if (accountType === 'organization') seq.push('invite_team')
    return seq
  }

  const goToStep = (delta) => {
    const seq = getFlowSequence()
    const idx = seq.indexOf(step)
    const target = seq[idx + delta]
    if (target) setStep(target)
  }
  const nextProfileStep = () => goToStep(1)
  const prevProfileStep = () => goToStep(-1)

  const chooseIndividual = () => { setAccountType('individual'); setStep('profile_locale') }
  const chooseOrganization = () => { setAccountType('organization'); setStep('org_name') }

  // -- Context step: NO backend call here anymore. File/text just gets
  // held in state, same as every other profile field, and is uploaded
  // once during the final submission below — this is what actually lets
  // onboarding run entirely before an account exists.
  const continueFromContext = () => setStep('account_create')
  const skipContext = () => { setContextFile(null); setContextText(''); setStep('account_create') }

  // -- The one real submission: creates the account, then fires every
  // deferred backend call using the token we just received. ------------
  const submitAccount = async (e) => {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter your full name')
    if (!EMAIL_RE.test(email.trim())) return setError('Please enter a valid email address')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')
    if (!agreed) return setError('Please agree to the Terms of Use and Privacy Policy to continue')

    setSaving(true)
    setError('')
    try {
      const data = await api.register(
        name.trim(), email.trim(), password, referralCode,
        legalMeta?.terms?.version || '2026-09-05',
        legalMeta?.privacy?.version || '2026-09-05',
      )
      setToken(data.access_token)
      await onLogin({ access_token: data.access_token, refresh_token: data.refresh_token })

      if (accountType === 'organization') {
        await api.createOrganization(data.access_token, orgName.trim())
        setIsOrgAdmin(true)
      }

      // NOTE: primary_goals is sent joined as a comma-separated string
      // into the existing `primary_goal` field, since that's a single
      // String column today. If you want real multi-value storage,
      // the backend column needs to become a JSON/array type — flag
      // this to me once you share onboarding_routes.py and I'll wire
      // it up properly instead of this stand-in.
      await api.saveOnboarding(data.access_token, {
        country: fields.country,
        language: fields.language,
        job_title: fields.job_title,
        role_summary: fields.role_summary,
        company_name: fields.company_name,
        what_we_sell: fields.what_we_sell,
        sales_methodology: fields.sales_methodology,
        primary_goal: fields.primary_goals.join(', '),
      })

      if (contextFile) {
        await api.uploadContextFile(data.access_token, contextFile)
      } else if (contextText.trim()) {
        await api.uploadContextText(data.access_token, contextText.trim())
      }

      if (accountType === 'organization') {
        setStep('invite_team')
      } else {
        finish(data.access_token)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const addInviteRow = () => setInviteEmails(prev => [...prev, ''])
  const updateInviteEmail = (i, value) => {
    setInviteEmails(prev => prev.map((e, idx) => (idx === i ? value : e)))
  }

  const submitInvites = async () => {
    setSaving(true)
    setError('')
    try {
      const emails = inviteEmails.map(e => e.trim()).filter(Boolean)
      for (const email of emails) {
        await api.createInvite(token, email, 'member')
      }
      finish(token)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }
  const skipInvites = () => finish(token)

  const finish = async (sessionToken) => {
    try {
      await api.saveOnboarding(sessionToken, { complete: true })
    } catch (err) {
      console.error('Failed to mark onboarding complete:', err)
    }
    setStep('transitioning')
    setTimeout(() => {
      onComplete?.()
      navigate({ to: '/' })
    }, 1400)
  }

  return (
    <div className="osf-onb">
      <style>{`
        .osf-onb{
          --navy-950:#08172A; --navy-900:#0A1A2F; --navy-700:#1B3A5C;
          --bg:#FCFBF9; --line:#E5E2DB; --line-strong:#D8D4C9;
          --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
          --accent:#C79541; --accent-soft:#F6ECD9; --accent-strong:#8F6423; --teal:#2F9C8E; --danger:#B3453B;
          --ease:cubic-bezier(.22,.61,.36,1);
          min-height:100dvh; display:grid; place-items:center; padding:32px 20px;
          font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--text-body);
          background:var(--bg); position:relative; overflow:hidden;
        }
        .osf-onb *{box-sizing:border-box;}
        .osf-onb h1{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
          margin:0 0 8px;font-size:clamp(23px,3.2vw,28px);letter-spacing:-.02em;}
        .osf-onb-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
        .osf-onb-blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.5;}
        .osf-onb-blob.a{width:520px;height:520px;top:-200px;right:-120px;
          background:radial-gradient(circle,rgba(199,149,65,.42),transparent 70%);}
        .osf-onb-blob.b{width:460px;height:460px;bottom:-220px;left:-140px;
          background:radial-gradient(circle,rgba(47,156,142,.3),transparent 70%);}
        .osf-onb-grid{position:absolute;inset:0;pointer-events:none;opacity:.5;
          background-image:linear-gradient(rgba(10,26,47,.045) 1px,transparent 1px),
            linear-gradient(90deg,rgba(10,26,47,.045) 1px,transparent 1px);
          background-size:46px 46px;
          mask-image:radial-gradient(circle at 50% 40%,#000,transparent 72%);}
        .osf-onb-stage{position:relative;z-index:1;width:100%;max-width:540px;}
        .osf-onb-card{
          position:relative;background:rgba(255,255,255,.85);backdrop-filter:blur(14px);
          border:1px solid var(--line);border-radius:18px;padding:2.75rem 2.25rem 2.25rem;
          box-shadow:0 30px 60px -34px rgba(10,26,47,.4),0 1px 2px rgba(10,26,47,.05);
        }
        .osf-onb-dots{display:flex;gap:6px;justify-content:center;margin-bottom:2.25rem;}
        .osf-onb-dot{height:6px;border-radius:99px;transition:all .4s var(--ease);}
        .osf-onb-sub{color:var(--text-muted);font-size:14px;line-height:1.6;margin:0 0 1.75rem;}
        .osf-onb-backlink{display:inline-flex;align-items:center;background:none;border:none;
          color:var(--text-muted);font-size:13px;cursor:pointer;padding:0;margin-bottom:1.25rem;
          font-family:inherit;transition:color .2s var(--ease);}
        .osf-onb-backlink:hover{color:var(--navy-900);}
        .osf-onb-choice-row{display:flex;gap:14px;}
        .osf-onb-choice{flex:1;position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(245,243,238,.6));
          border:1px solid var(--line);border-radius:14px;padding:1.75rem 1.25rem;cursor:pointer;
          display:flex;flex-direction:column;gap:8px;color:inherit;font-family:inherit;text-align:left;
          transition:transform .35s var(--ease),box-shadow .35s var(--ease),border-color .35s var(--ease);}
        .osf-onb-choice:hover{transform:translateY(-4px);border-color:rgba(199,149,65,.5);
          box-shadow:0 24px 44px -28px rgba(10,26,47,.5);}
        .osf-onb-choice-icon{width:38px;height:38px;border-radius:11px;
          background:linear-gradient(135deg,var(--accent-soft),#FBF3E3);color:var(--accent-strong);
          display:flex;align-items:center;justify-content:center;margin-bottom:2px;
          transition:transform .4s var(--ease);}
        .osf-onb-choice:hover .osf-onb-choice-icon{transform:translateY(-2px) rotate(-6deg) scale(1.08);}
        .osf-onb-choice-label{color:var(--navy-950);font-size:15.5px;font-weight:600;}
        .osf-onb-choice-sub{color:var(--text-muted);font-size:12.5px;}
        .osf-onb-field-row{display:flex;gap:12px;}
        .osf-onb-field-label{color:var(--navy-700);font-size:12.5px;font-weight:600;margin:0 0 6px;}
        .osf-onb-input, .osf-onb-textarea{width:100%;padding:11px 13px;border-radius:10px;
          border:1px solid var(--line);background:#fff;color:var(--text);font-size:14px;
          margin-bottom:10px;font-family:inherit;
          transition:border-color .25s var(--ease),box-shadow .25s var(--ease),transform .25s var(--ease);}
        .osf-onb-input::placeholder, .osf-onb-textarea::placeholder{color:#B6B2A6;}
        .osf-onb-input:hover, .osf-onb-textarea:hover{border-color:var(--line-strong);}
        .osf-onb-input:focus, .osf-onb-textarea:focus{outline:none;border-color:var(--accent);
          box-shadow:0 0 0 4px rgba(199,149,65,.16);transform:translateY(-1px);}
        .osf-onb-textarea{resize:vertical;}
        .osf-onb-chip-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:1.5rem;}
        .osf-onb-chip{padding:9px 17px;border-radius:99px;border:1px solid var(--line);
          background:#fff;color:var(--text-muted);font-size:13px;cursor:pointer;font-family:inherit;
          transition:all .25s var(--ease);}
        .osf-onb-chip:hover{border-color:rgba(199,149,65,.5);color:var(--navy-900);}
        .osf-onb-chip.active{background:linear-gradient(135deg,var(--navy-900),var(--navy-700));
          border-color:var(--navy-900);color:#fff;box-shadow:0 10px 22px -14px rgba(10,26,47,.7);}
        .osf-onb-dropzone{display:flex;flex-direction:column;align-items:center;gap:10px;
          padding:2.1rem 1.5rem;border:1.5px dashed var(--line-strong);border-radius:14px;
          cursor:pointer;margin-bottom:1rem;background:rgba(245,243,238,.6);
          transition:border-color .3s var(--ease),background .3s var(--ease),transform .3s var(--ease);}
        .osf-onb-dropzone:hover{border-color:var(--accent);background:var(--accent-soft);transform:translateY(-2px);}
        .osf-onb-dropzone-icon{width:40px;height:40px;border-radius:11px;background:#fff;
          border:1px solid var(--line);color:var(--navy-700);display:flex;align-items:center;justify-content:center;}
        .osf-onb-dropzone-text{color:var(--text-muted);font-size:13.5px;text-align:center;}
        .osf-onb-btn{position:relative;overflow:hidden;width:100%;padding:12.5px;border-radius:10px;
          border:none;background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;
          font-weight:600;cursor:pointer;font-size:14.5px;margin-top:4px;font-family:inherit;
          box-shadow:0 16px 30px -18px rgba(10,26,47,.8);
          transition:transform .25s var(--ease),box-shadow .25s var(--ease),opacity .2s var(--ease);}
        .osf-onb-btn::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
          transform:translateX(-140%) skewX(-18deg);}
        .osf-onb-btn:hover:not(:disabled)::after{transition:transform .8s var(--ease);transform:translateX(300%) skewX(-18deg);}
        .osf-onb-btn:hover:not(:disabled){transform:translateY(-2px);
          box-shadow:0 22px 40px -18px rgba(10,26,47,.75),0 0 0 4px rgba(199,149,65,.16);}
        .osf-onb-btn:active:not(:disabled){transform:translateY(0) scale(.99);}
        .osf-onb-btn:disabled{opacity:.55;cursor:default;}
        .osf-onb-btn-ghost{width:100%;padding:11px;border-radius:8px;background:none;
          color:var(--text-muted);border:none;cursor:pointer;font-size:13px;margin-top:10px;
          font-family:inherit;transition:color .2s var(--ease);}
        .osf-onb-btn-ghost:hover{color:var(--navy-900);}
        .osf-onb-btn-ghost-small{background:none;border:none;color:var(--accent-strong);cursor:pointer;
          font-size:13px;padding:0;margin-bottom:1.5rem;font-family:inherit;font-weight:600;}
        .osf-onb-error{display:flex;gap:8px;align-items:flex-start;color:var(--danger);font-size:13px;
          margin:0 0 12px;background:rgba(179,69,59,.07);border:1px solid rgba(179,69,59,.2);
          padding:9px 11px;border-radius:9px;}
        .osf-onb-transition{display:flex;flex-direction:column;align-items:center;gap:1.5rem;padding:2.5rem 0;}
        .osf-onb-skel-group{width:100%;display:flex;flex-direction:column;gap:10px;align-items:center;}
        .osf-onb-skel{height:11px;border-radius:5px;
          background:linear-gradient(90deg,var(--accent-soft) 25%,#FBF4E6 37%,var(--accent-soft) 63%);
          background-size:400% 100%;animation:osfOnbShimmer 1.6s ease-in-out infinite;}
        @keyframes osfOnbShimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}
        .osf-onb-transition-text{color:var(--text-muted);font-size:14px;}
        .osf-onb-transition-check{width:44px;height:44px;border-radius:50%;
          background:linear-gradient(135deg,var(--teal),#3FB6A6);color:#fff;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 14px 30px -14px rgba(47,156,142,.7);}

        /* -- account_create step (ported from Signup.jsx) -- */
        .osf-onb-label{color:var(--navy-700);font-size:12.5px;font-weight:600;letter-spacing:.01em;
          display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
        .osf-onb-inputwrap{position:relative;display:flex;align-items:center;}
        .osf-onb-input.has-affix{padding-right:42px;}
        .osf-onb-affix{position:absolute;right:6px;display:grid;place-items:center;width:32px;height:32px;
          border:none;background:none;color:var(--text-muted);cursor:pointer;border-radius:8px;
          transition:color .2s var(--ease),background .2s var(--ease);}
        .osf-onb-affix:hover{color:var(--navy-700);background:rgba(10,26,47,.05);}
        .osf-onb-meter{display:flex;gap:4px;margin-top:2px;margin-bottom:10px;}
        .osf-onb-meter span{height:3px;flex:1;border-radius:99px;background:var(--line);
          transition:background .35s var(--ease);}
        .osf-onb-hint{font-size:11.5px;font-weight:600;letter-spacing:.02em;}
        .osf-onb-ok{display:inline-flex;align-items:center;gap:4px;color:var(--teal);font-size:11.5px;font-weight:600;}
        .osf-onb-consent{display:flex;align-items:flex-start;gap:9px;margin:6px 0 14px;}
        .osf-onb-consent-checkbox{
          appearance:none;-webkit-appearance:none;flex:0 0 auto;width:17px;height:17px;margin-top:1px;
          border:1.5px solid var(--line-strong);border-radius:5px;background:#fff;cursor:pointer;
          display:grid;place-items:center;transition:border-color .2s var(--ease),background .2s var(--ease);
        }
        .osf-onb-consent-checkbox:hover{border-color:var(--accent);}
        .osf-onb-consent-checkbox:checked{background:var(--navy-900);border-color:var(--navy-900);}
        .osf-onb-consent-checkbox:checked::after{
          content:"";width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;
          transform:translateY(-1px) rotate(45deg);
        }
        .osf-onb-consent-label{font-size:12.5px;line-height:1.55;color:var(--text-muted);cursor:pointer;user-select:none;}
        .osf-onb-consent-label a{color:var(--navy-700);font-weight:600;text-decoration:none;}
        .osf-onb-consent-label a:hover{color:var(--accent-strong);text-decoration:underline;}
        .osf-onb-spin{animation:osfOnbRot 1s linear infinite;}
        @keyframes osfOnbRot{to{transform:rotate(360deg);}}

        @media (max-width:520px){ .osf-onb-choice-row{flex-direction:column;} .osf-onb-field-row{flex-direction:column;} }
        @media (prefers-reduced-motion:reduce){
          .osf-onb-blob{display:none;}
          .osf-onb-input:focus,.osf-onb-textarea:focus,.osf-onb-btn:hover,.osf-onb-choice:hover{transform:none;}
        }
      `}</style>

      <div className="osf-onb-aurora" aria-hidden="true">
        <motion.div className="osf-onb-blob a"
          animate={reduce ? undefined : { x: [0, 28, -12, 0], y: [0, -20, 16, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="osf-onb-blob b"
          animate={reduce ? undefined : { x: [0, -24, 18, 0], y: [0, 18, -14, 0] }}
          transition={{ duration: 27, repeat: Infinity, ease: 'easeInOut' }} />
      </div>
      <div className="osf-onb-grid" aria-hidden="true" />

      <div className="osf-onb-stage">
        <motion.div
          className="osf-onb-card"
          initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <ProgressDots step={step} sequence={getFlowSequence()} />

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              {step === 'account_type' && (
                <div>
                  <h1>Welcome to OSF-Suite</h1>
                  <p className="osf-onb-sub">Let's set up your workspace.</p>
                  <div className="osf-onb-choice-row">
                    <button className="osf-onb-choice" onClick={chooseIndividual}>
                      <span className="osf-onb-choice-icon"><User size={20} /></span>
                      <span className="osf-onb-choice-label">Just me</span>
                      <span className="osf-onb-choice-sub">Individual account</span>
                    </button>
                    <button className="osf-onb-choice" onClick={chooseOrganization}>
                      <span className="osf-onb-choice-icon"><Building2 size={20} /></span>
                      <span className="osf-onb-choice-label">My team</span>
                      <span className="osf-onb-choice-sub">Create an organization</span>
                    </button>
                  </div>
                </div>
              )}

              {step === 'org_name' && (
                <div>
                  <BackLink onClick={() => setStep('account_type')} />
                  <h1>What's your company called?</h1>
                  <p className="osf-onb-sub">You'll be the admin. You can invite your team in a moment.</p>
                  <input
                    className="osf-onb-input"
                    placeholder="Acme Inc."
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    autoFocus
                  />
                  <button className="osf-onb-btn" onClick={nextProfileStep} disabled={!orgName.trim()}>
                    Continue
                  </button>
                </div>
              )}

              {step === 'profile_locale' && (
                <div>
                  <BackLink onClick={prevProfileStep} />
                  <h1>Where are you joining from?</h1>
                  <p className="osf-onb-sub">We picked these up automatically. Feel free to correct them.</p>
                  <div className="osf-onb-field-row">
                    <Field label="Country" value={fields.country} onChange={v => updateField('country', v)} />
                    <Field label="Language" value={fields.language} onChange={v => updateField('language', v)} />
                  </div>
                  <button className="osf-onb-btn" onClick={nextProfileStep}>Continue</button>
                </div>
              )}

              {step === 'profile_job_title' && (
                <div>
                  <BackLink onClick={prevProfileStep} />
                  <h1>What's your job title?</h1>
                  <p className="osf-onb-sub">This helps us tailor your coaching from day one.</p>
                  <Field placeholder="e.g. Account Executive" value={fields.job_title} onChange={v => updateField('job_title', v)} />
                  <button className="osf-onb-btn" onClick={nextProfileStep}>Continue</button>
                </div>
              )}

              {step === 'profile_role_summary' && (
                <div>
                  <BackLink onClick={prevProfileStep} />
                  <h1>Briefly, what does your role involve?</h1>
                  <p className="osf-onb-sub">A sentence or two is plenty.</p>
                  <Field textarea
                    placeholder="e.g. I run discovery and closing calls for mid-market accounts"
                    value={fields.role_summary} onChange={v => updateField('role_summary', v)} />
                  <button className="osf-onb-btn" onClick={nextProfileStep}>Continue</button>
                </div>
              )}

              {step === 'profile_company' && (
                <div>
                  <BackLink onClick={prevProfileStep} />
                  <h1>What company do you work for?</h1>
                  <Field placeholder="e.g. Acme Inc." value={fields.company_name} onChange={v => updateField('company_name', v)} />
                  <button className="osf-onb-btn" onClick={nextProfileStep}>Continue</button>
                </div>
              )}

              {step === 'profile_what_we_sell' && (
                <div>
                  <BackLink onClick={prevProfileStep} />
                  <h1>What do you sell?</h1>
                  <p className="osf-onb-sub">Product, market, price point. Whatever gives useful context.</p>
                  <Field textarea
                    placeholder="e.g. B2B SaaS for supply chain teams, $99 to $999 per month"
                    value={fields.what_we_sell} onChange={v => updateField('what_we_sell', v)} />
                  <button className="osf-onb-btn" onClick={nextProfileStep}>Continue</button>
                </div>
              )}

              {step === 'profile_methodology' && (
                <div>
                  <BackLink onClick={prevProfileStep} />
                  <h1>What sales methodology do you use?</h1>
                  <div className="osf-onb-chip-row">
                    {SALES_METHODOLOGIES.map(m => (
                      <button key={m}
                        className={`osf-onb-chip${fields.sales_methodology === m ? ' active' : ''}`}
                        onClick={() => updateField('sales_methodology', m)}>
                        {m}
                      </button>
                    ))}
                  </div>
                  <button className="osf-onb-btn" onClick={nextProfileStep}>Continue</button>
                </div>
              )}

              {step === 'profile_goal' && (
                <div>
                  <BackLink onClick={prevProfileStep} />
                  <h1>What are your main goals right now?</h1>
                  <p className="osf-onb-sub">Pick as many as apply.</p>
                  <div className="osf-onb-chip-row">
                    {PRIMARY_GOALS.map(g => (
                      <button key={g.value}
                        className={`osf-onb-chip${fields.primary_goals.includes(g.value) ? ' active' : ''}`}
                        onClick={() => toggleGoal(g.value)}>
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <button className="osf-onb-btn" onClick={nextProfileStep} disabled={fields.primary_goals.length === 0}>
                    Continue
                  </button>
                </div>
              )}

              {step === 'context' && (
                <div>
                  <BackLink onClick={prevProfileStep} />
                  <h1>Let's make your coach smart from day one</h1>
                  <p className="osf-onb-sub">
                    Upload a pricing sheet, pitch deck, or product doc. Every meeting you analyze from
                    here on will be checked against it automatically.
                    {accountType === 'organization' && ' This will be shared with your whole team.'}
                  </p>

                  <label className="osf-onb-dropzone">
                    <input type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }}
                      onChange={e => setContextFile(e.target.files[0])} />
                    <span className="osf-onb-dropzone-icon"><FileText size={22} /></span>
                    <span className="osf-onb-dropzone-text">
                      {contextFile ? contextFile.name : 'Click to upload a file, or paste text below'}
                    </span>
                  </label>

                  <textarea
                    className="osf-onb-textarea"
                    placeholder="Or paste your context directly: pricing, positioning, competitors, anything a new rep would need to know."
                    value={contextText}
                    onChange={e => setContextText(e.target.value)}
                    rows={5}
                  />

                  <button className="osf-onb-btn" onClick={continueFromContext} disabled={!contextFile && !contextText.trim()}>
                    Continue
                  </button>
                  <button className="osf-onb-btn-ghost" onClick={skipContext}>
                    Skip for now
                  </button>
                </div>
              )}

              {step === 'account_create' && (
                <div>
                  <BackLink onClick={prevProfileStep} />
                  <h1>Create your account</h1>
                  <p className="osf-onb-sub">Last step — this is what you'll use to sign in.</p>

                  <form onSubmit={submitAccount} noValidate>
                    <p className="osf-onb-field-label">Full name</p>
                    <input className="osf-onb-input" type="text" autoComplete="name" placeholder="Jordan Rivera"
                      maxLength={100} value={name} onChange={e => setName(e.target.value)} required />

                    <p className="osf-onb-field-label">Email</p>
                    <input className="osf-onb-input" type="email" autoComplete="email" placeholder="you@company.com"
                      maxLength={255} value={email} onChange={e => setEmail(e.target.value)} required />

                    <label className="osf-onb-label">
                      Password
                      {password.length > 0 && (
                        <span className="osf-onb-hint" style={{ color: STRENGTH_COLOR[score] }}>{STRENGTH_LABEL[score]}</span>
                      )}
                    </label>
                    <div className="osf-onb-inputwrap">
                      <input className="osf-onb-input has-affix" type={showPw ? 'text' : 'password'}
                        autoComplete="new-password" placeholder="At least 8 characters" maxLength={128}
                        value={password} onChange={e => setPassword(e.target.value)} required />
                      <button type="button" className="osf-onb-affix" onClick={() => setShowPw(v => !v)}
                        aria-label={showPw ? 'Hide password' : 'Show password'}>
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <div className="osf-onb-meter" aria-hidden="true">
                      {[0, 1, 2, 3].map(i => (
                        <span key={i} style={{ background: i < score ? STRENGTH_COLOR[score] : undefined }} />
                      ))}
                    </div>

                    <label className="osf-onb-label">
                      Confirm password
                      {matches && <span className="osf-onb-ok"><Check size={12} /> Match</span>}
                    </label>
                    <input className="osf-onb-input" type={showPw ? 'text' : 'password'} autoComplete="new-password"
                      placeholder="Re-enter your password" maxLength={128}
                      value={confirm} onChange={e => setConfirm(e.target.value)} required />

                    <div className="osf-onb-consent">
                      <input id="osf-onb-consent-checkbox" className="osf-onb-consent-checkbox" type="checkbox"
                        checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                      <label htmlFor="osf-onb-consent-checkbox" className="osf-onb-consent-label">
                        I agree to OSF-Suite&rsquo;s{' '}
                        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Use</a>{' '}
                        and{' '}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>,
                        including how call recordings are processed and analyzed by AI.
                      </label>
                    </div>

                    {error && <p className="osf-onb-error">{error}</p>}

                    <button className="osf-onb-btn" type="submit" disabled={saving || !agreed}>
                      {saving ? (<><Loader2 size={16} className="osf-onb-spin" /> Creating account…</>) : 'Create account & continue'}
                    </button>
                  </form>
                </div>
              )}

              {step === 'invite_team' && (
                <div>
                  <h1>Invite your team</h1>
                  <p className="osf-onb-sub">Optional. You can always do this later from your team settings.</p>

                  {inviteEmails.map((email, i) => (
                    <input key={i} className="osf-onb-input" type="email" placeholder="teammate@company.com"
                      value={email} onChange={e => updateInviteEmail(i, e.target.value)} />
                  ))}
                  <button className="osf-onb-btn-ghost-small" onClick={addInviteRow}>+ Add another</button>

                  {error && <p className="osf-onb-error">{error}</p>}
                  <button className="osf-onb-btn" onClick={submitInvites} disabled={saving}>
                    {saving ? 'Sending invites...' : 'Send invites'}
                  </button>
                  <button className="osf-onb-btn-ghost" onClick={skipInvites} disabled={saving}>
                    Skip for now
                  </button>
                </div>
              )}

              {step === 'transitioning' && (
                <div className="osf-onb-transition">
                  <motion.div
                    className="osf-onb-transition-check"
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                  >
                    <Check size={20} strokeWidth={3} />
                  </motion.div>
                  <div className="osf-onb-skel-group">
                    <div className="osf-onb-skel" style={{ width: '60%' }} />
                    <div className="osf-onb-skel" style={{ width: '90%' }} />
                    <div className="osf-onb-skel" style={{ width: '75%' }} />
                  </div>
                  <p className="osf-onb-transition-text">Personalizing your experience...</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, textarea }) {
  return (
    <div style={{ marginBottom: '1.25rem', flex: 1 }}>
      {label && <p className="osf-onb-field-label">{label}</p>}
      {textarea ? (
        <textarea className="osf-onb-textarea" rows={2} placeholder={placeholder}
          value={value} onChange={e => onChange(e.target.value)} autoFocus />
      ) : (
        <input className="osf-onb-input" placeholder={placeholder}
          value={value} onChange={e => onChange(e.target.value)} autoFocus />
      )}
    </div>
  )
}

function BackLink({ onClick }) {
  return (
    <button type="button" className="osf-onb-backlink" onClick={onClick}>
      <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Back
    </button>
  )
}

function ProgressDots({ step, sequence }) {
  const steps = sequence.filter(s => s !== 'transitioning')
  const currentIndex = steps.indexOf(step)
  if (currentIndex === -1) return null
  return (
    <div className="osf-onb-dots">
      {steps.map((s, i) => (
        <div key={s} className="osf-onb-dot" style={{
          background: i < currentIndex ? 'var(--navy-900)'
            : i === currentIndex ? 'linear-gradient(135deg, var(--accent), #E7BC6B)' : 'var(--line)',
          width: i === currentIndex ? '22px' : '7px',
        }} />
      ))}
    </div>
  )
}