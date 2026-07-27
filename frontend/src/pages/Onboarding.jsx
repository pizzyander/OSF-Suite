import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

// Auto-detect the user's likely country/language from the browser so the
// first screen feels like it already "knows" them — they confirm rather
// than type from scratch. This is a well-worn premium-SaaS pattern
// (Notion, Linear, Superhuman all do a version of this).
function detectLocale() {
  const locale = navigator.language || 'en-US' // e.g. "en-US", "fr-FR"
  const languageNames = new Intl.DisplayNames([locale], { type: 'language' })
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' })
  const [lang, region] = locale.split('-')
  return {
    language: languageNames.of(lang) || 'English',
    country: region ? (regionNames.of(region) || '') : '',
  }
}

const SALES_METHODOLOGIES = ['MEDDIC', 'SPIN', 'Challenger', 'Sandler', 'Consultative', 'Other / None']
const PRIMARY_GOALS = [
  { value: 'close_more', label: 'Close more deals' },
  { value: 'objections', label: 'Handle objections better' },
  { value: 'discovery',  label: 'Improve discovery calls' },
  { value: 'coach_team', label: 'Coach my team' },
]

export default function Onboarding({ token, onComplete }) {
  const navigate = useNavigate()
  const [step, setStep] = useState('account_type')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    primary_goal: '',
  })

  const [contextText, setContextText] = useState('')
  const [contextFile, setContextFile] = useState(null)

  const [inviteEmails, setInviteEmails] = useState([''])
  const [isOrgAdmin, setIsOrgAdmin] = useState(false)

  const updateField = (key, value) => setFields(prev => ({ ...prev, [key]: value }))

  // Full ordered list of every screen in the flow, computed dynamically since
  // it depends on account type (individual vs org) and admin status. Used for
  // both the progress dots and generic next/back navigation.
  const getFlowSequence = () => {
    const seq = ['account_type']
    if (accountType === 'organization') seq.push('org_name')
    seq.push('profile_locale', 'profile_job_title', 'profile_role_summary')
    if (accountType === 'individual') seq.push('profile_company')
    seq.push('profile_what_we_sell', 'profile_methodology', 'profile_goal', 'context')
    if (isOrgAdmin) seq.push('invite_team')
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

  const chooseIndividual = () => {
    setAccountType('individual')
    setStep('profile_locale')
  }
  const chooseOrganization = () => {
    setAccountType('organization')
    setStep('org_name')
  }

  const submitOrgName = async () => {
    if (!orgName.trim()) return
    setSaving(true)
    setError('')
    try {
      await api.createOrganization(token, orgName.trim())
      setIsOrgAdmin(true)
      setStep('profile_locale')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Fires on the last profile sub-step (primary goal). Everything collected
  // across the profile screens is sent in a single call, same as before.
  const submitProfile = async () => {
    setSaving(true)
    setError('')
    try {
      await api.saveOnboarding(token, fields)
      setStep('context')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const submitContext = async () => {
    setSaving(true)
    setError('')
    try {
      if (contextFile) {
        await api.uploadContextFile(token, contextFile)
      } else if (contextText.trim()) {
        await api.uploadContextText(token, contextText.trim())
      }
      if (isOrgAdmin) {
        setStep('invite_team')
      } else {
        setStep('transitioning')
        finish()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const skipContext = () => {
    if (isOrgAdmin) {
      setStep('invite_team')
    } else {
      setStep('transitioning')
      finish()
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
      setStep('transitioning')
      finish()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const skipInvites = () => {
    setStep('transitioning')
    finish()
  }

  const finish = async () => {
    try {
      await api.saveOnboarding(token, { complete: true })
    } catch (err) {
      console.error('Failed to mark onboarding complete:', err)
    }
    setTimeout(() => {
      onComplete?.()
      navigate('/')
    }, 1400)
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <ProgressDots step={step} sequence={getFlowSequence()} />

        {step === 'account_type' && (
          <div style={styles.stepBox}>
            <h1 style={styles.title}>Welcome to OSF-Suite</h1>
            <p style={styles.sub}>Let's set up your workspace.</p>
            <div style={styles.choiceRow}>
              <button style={styles.choiceCard} onClick={chooseIndividual}>
                <span style={styles.choiceIcon}>👤</span>
                <span style={styles.choiceLabel}>Just me</span>
                <span style={styles.choiceSub}>Individual account</span>
              </button>
              <button style={styles.choiceCard} onClick={chooseOrganization}>
                <span style={styles.choiceIcon}>🏢</span>
                <span style={styles.choiceLabel}>My team</span>
                <span style={styles.choiceSub}>Create an organization</span>
              </button>
            </div>
          </div>
        )}

        {step === 'org_name' && (
          <div style={styles.stepBox}>
            <BackLink onClick={() => setStep('account_type')} />
            <h1 style={styles.title}>What's your company called?</h1>
            <p style={styles.sub}>You'll be the admin — you can invite your team in a moment.</p>
            <input
              style={styles.input}
              placeholder="Acme Inc."
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              autoFocus
            />
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.btn} onClick={submitOrgName} disabled={saving || !orgName.trim()}>
              {saving ? 'Creating...' : 'Continue'}
            </button>
          </div>
        )}

        {step === 'profile_locale' && (
          <div style={styles.stepBox}>
            <BackLink onClick={prevProfileStep} />
            <h1 style={styles.title}>Where are you joining from?</h1>
            <p style={styles.sub}>We picked these up automatically — feel free to correct them.</p>
            <div style={styles.fieldRow}>
              <Field label="Country" value={fields.country} onChange={v => updateField('country', v)} />
              <Field label="Language" value={fields.language} onChange={v => updateField('language', v)} />
            </div>
            <button style={styles.btn} onClick={nextProfileStep}>Continue</button>
          </div>
        )}

        {step === 'profile_job_title' && (
          <div style={styles.stepBox}>
            <BackLink onClick={prevProfileStep} />
            <h1 style={styles.title}>What's your job title?</h1>
            <p style={styles.sub}>This helps us tailor your coaching from day one.</p>
            <Field placeholder="e.g. Account Executive" value={fields.job_title} onChange={v => updateField('job_title', v)} />
            <button style={styles.btn} onClick={nextProfileStep}>Continue</button>
          </div>
        )}

        {step === 'profile_role_summary' && (
          <div style={styles.stepBox}>
            <BackLink onClick={prevProfileStep} />
            <h1 style={styles.title}>Briefly, what does your role involve?</h1>
            <p style={styles.sub}>A sentence or two is plenty.</p>
            <Field textarea
              placeholder="e.g. I run discovery and closing calls for mid-market accounts"
              value={fields.role_summary} onChange={v => updateField('role_summary', v)} />
            <button style={styles.btn} onClick={nextProfileStep}>Continue</button>
          </div>
        )}

        {step === 'profile_company' && (
          <div style={styles.stepBox}>
            <BackLink onClick={prevProfileStep} />
            <h1 style={styles.title}>What company do you work for?</h1>
            <Field placeholder="e.g. Acme Inc." value={fields.company_name} onChange={v => updateField('company_name', v)} />
            <button style={styles.btn} onClick={nextProfileStep}>Continue</button>
          </div>
        )}

        {step === 'profile_what_we_sell' && (
          <div style={styles.stepBox}>
            <BackLink onClick={prevProfileStep} />
            <h1 style={styles.title}>What do you sell?</h1>
            <p style={styles.sub}>Product, market, price point — whatever gives useful context.</p>
            <Field textarea
              placeholder="e.g. B2B SaaS for supply chain teams, $99-$999/mo"
              value={fields.what_we_sell} onChange={v => updateField('what_we_sell', v)} />
            <button style={styles.btn} onClick={nextProfileStep}>Continue</button>
          </div>
        )}

        {step === 'profile_methodology' && (
          <div style={styles.stepBox}>
            <BackLink onClick={prevProfileStep} />
            <h1 style={styles.title}>What sales methodology do you use?</h1>
            <div style={styles.chipRow}>
              {SALES_METHODOLOGIES.map(m => (
                <button key={m}
                  style={{ ...styles.chip, ...(fields.sales_methodology === m ? styles.chipActive : {}) }}
                  onClick={() => updateField('sales_methodology', m)}>
                  {m}
                </button>
              ))}
            </div>
            <button style={styles.btn} onClick={nextProfileStep}>
              Continue
            </button>
          </div>
        )}

        {step === 'profile_goal' && (
          <div style={styles.stepBox}>
            <BackLink onClick={prevProfileStep} />
            <h1 style={styles.title}>What's your main goal right now?</h1>
            <div style={styles.chipRow}>
              {PRIMARY_GOALS.map(g => (
                <button key={g.value}
                  style={{ ...styles.chip, ...(fields.primary_goal === g.value ? styles.chipActive : {}) }}
                  onClick={() => updateField('primary_goal', g.value)}>
                  {g.label}
                </button>
              ))}
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.btn} onClick={submitProfile} disabled={saving || !fields.primary_goal}>
              {saving ? 'Saving...' : 'Continue'}
            </button>
          </div>
        )}

        {step === 'context' && (
          <div style={styles.stepBox}>
            <h1 style={styles.title}>Let's make your coach smart from day one</h1>
            <p style={styles.sub}>
              Upload a pricing sheet, pitch deck, or product doc — every meeting you analyze from
              here on will be checked against it automatically.
              {isOrgAdmin && ' This will be shared with your whole team.'}
            </p>

            <label style={styles.dropzone}>
              <input type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }}
                onChange={e => setContextFile(e.target.files[0])} />
              <span style={styles.dropzoneIcon}>📄</span>
              <span style={styles.dropzoneText}>
                {contextFile ? contextFile.name : 'Click to upload a file, or paste text below'}
              </span>
            </label>

            <textarea
              style={styles.textarea}
              placeholder="Or paste your context directly — pricing, positioning, competitors, anything a new rep would need to know."
              value={contextText}
              onChange={e => setContextText(e.target.value)}
              rows={5}
            />

            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.btn} onClick={submitContext} disabled={saving || (!contextFile && !contextText.trim())}>
              {saving ? 'Uploading...' : 'Continue'}
            </button>
            <button style={styles.btnGhost} onClick={skipContext} disabled={saving}>
              Skip for now
            </button>
          </div>
        )}

        {step === 'invite_team' && (
          <div style={styles.stepBox}>
            <h1 style={styles.title}>Invite your team</h1>
            <p style={styles.sub}>Optional — you can always do this later from your team settings.</p>

            {inviteEmails.map((email, i) => (
              <input key={i} style={styles.input} type="email" placeholder="teammate@company.com"
                value={email} onChange={e => updateInviteEmail(i, e.target.value)} />
            ))}
            <button style={styles.btnGhostSmall} onClick={addInviteRow}>+ Add another</button>

            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.btn} onClick={submitInvites} disabled={saving}>
              {saving ? 'Sending invites...' : 'Send invites'}
            </button>
            <button style={styles.btnGhost} onClick={skipInvites} disabled={saving}>
              Skip for now
            </button>
          </div>
        )}

        {step === 'transitioning' && (
          <div style={styles.transitionBox}>
            <div style={styles.spinner} />
            <p style={styles.transitionText}>Personalizing your experience...</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, textarea }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      {label && <p style={styles.fieldLabel}>{label}</p>}
      {textarea ? (
        <textarea style={styles.textarea} rows={2} placeholder={placeholder}
          value={value} onChange={e => onChange(e.target.value)} autoFocus />
      ) : (
        <input style={styles.input} placeholder={placeholder}
          value={value} onChange={e => onChange(e.target.value)} autoFocus />
      )}
    </div>
  )
}

function BackLink({ onClick }) {
  return (
    <button type="button" style={styles.backLink} onClick={onClick}>
      ← Back
    </button>
  )
}

function ProgressDots({ step, sequence }) {
  // "transitioning" isn't a screen the user steps through, so it has no dot.
  const steps = sequence.filter(s => s !== 'transitioning')
  const currentIndex = steps.indexOf(step)
  if (currentIndex === -1) return null

  return (
    <div style={styles.dots}>
      {steps.map((s, i) => (
        <div key={s} style={{
          ...styles.dot,
          background: i <= currentIndex ? '#6c5ce7' : '#2a2a2a',
          width: i === currentIndex ? '24px' : '8px',
        }} />
      ))}
    </div>
  )
}

const styles = {
  wrap:      { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f0f0f', padding: '1.5rem' },
  card:      { width: '100%', maxWidth: '520px' },
  dots:      { display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '2rem' },
  dot:       { height: '8px', borderRadius: '4px', transition: 'all 0.3s ease' },
  stepBox:   { animation: 'fadeIn 0.4s ease' },
  backLink:  { background: 'none', border: 'none', color: '#666', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '1.25rem', fontFamily: 'inherit' },
  title:     { color: '#fff', fontSize: '26px', fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.02em' },
  sub:       { color: '#888', fontSize: '15px', lineHeight: 1.6, margin: '0 0 2rem' },
  choiceRow: { display: 'flex', gap: '14px' },
  choiceCard:{ flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '2rem 1.25rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px', color: 'inherit', fontFamily: 'inherit' },
  choiceIcon:{ fontSize: '30px' },
  choiceLabel:{ color: '#fff', fontSize: '16px', fontWeight: 600 },
  choiceSub: { color: '#666', fontSize: '13px' },
  fieldRow:  { display: 'flex', gap: '12px' },
  fieldLabel:{ color: '#aaa', fontSize: '13px', fontWeight: 600, margin: '0 0 8px' },
  input:     { width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #2a2a2a', background: '#151515', color: '#fff', fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box' },
  textarea:  { width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid #2a2a2a', background: '#151515', color: '#fff', fontSize: '14px', marginBottom: '10px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' },
  chipRow:   { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '1.5rem' },
  chip:      { padding: '8px 16px', borderRadius: '20px', border: '1px solid #2a2a2a', background: '#151515', color: '#aaa', fontSize: '13px', cursor: 'pointer' },
  chipActive:{ background: '#6c5ce7', borderColor: '#6c5ce7', color: '#fff' },
  dropzone:  { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '2.5rem 1.5rem', border: '1.5px dashed #333', borderRadius: '14px', cursor: 'pointer', marginBottom: '1rem', background: '#141414' },
  dropzoneIcon:{ fontSize: '28px' },
  dropzoneText:{ color: '#888', fontSize: '14px', textAlign: 'center' },
  btn:       { width: '100%', padding: '13px', borderRadius: '10px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '15px', marginTop: '4px' },
  btnGhost:  { width: '100%', padding: '11px', borderRadius: '10px', background: 'none', color: '#666', border: 'none', cursor: 'pointer', fontSize: '13px', marginTop: '10px' },
  btnGhostSmall:{ background: 'none', border: 'none', color: '#6c5ce7', cursor: 'pointer', fontSize: '13px', padding: 0, marginBottom: '1.5rem' },
  error:     { color: '#ff6b6b', fontSize: '13px', margin: '0 0 12px' },
  transitionBox:{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', padding: '3rem 0' },
  spinner:   { width: '32px', height: '32px', border: '3px solid #2a2a2a', borderTopColor: '#6c5ce7', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  transitionText:{ color: '#888', fontSize: '14px' },
}
