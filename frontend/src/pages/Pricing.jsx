import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ArrowLeft } from 'lucide-react'
import { api } from '../api'

const INDIVIDUAL_PLANS = [
  {
    key: 'individual_2week',
    label: '2 Weeks',
    price: 12000,
    unit: '/ 2 weeks',
    tagline: 'Try a real sales sprint',
    benefits: [
      'Live transcription & speaker identification',
      'Post-call coaching analysis',
      'Real-time objection & buying-signal nudges',
      'RAG-grounded coaching on your own pricing/positioning',
    ],
  },
  {
    key: 'individual_1month',
    label: '1 Month',
    price: 53000,
    unit: '/ month',
    tagline: 'Most flexible',
    benefits: [
      'Everything in the 2-week plan',
      'Weekly AI-generated coaching plan from your gaps',
      'Winning-technique library from your own best calls',
      'Cancel anytime',
    ],
  },
  {
    key: 'individual_1year',
    label: '1 Year',
    price: 605000,
    unit: '/ year',
    tagline: 'Best value, save 5%',
    highlight: true,
    benefits: [
      'Everything in the monthly plan',
      'Save vs. paying monthly all year',
      'Priority email support',
      'Locked-in pricing for 12 months',
    ],
  },
]

const TEAM_PLAN = {
  key: 'team_monthly',
  label: 'Team',
  pricePerSeat: 139000,
  unit: '/ seat / month',
  minSeats: 5,
  tagline: 'For sales teams',
  benefits: [
    'Everything in the individual plan, for every rep',
    'Shared company context across your whole team',
    'Manager dashboards: deal health & coaching trends',
    'Team-wide winning-technique library',
    'Admin controls: invites, roles, reporting lines',
  ],
}

export default function Pricing({ token, profile }) {
  const navigate = useNavigate()
  const [seats, setSeats] = useState(TEAM_PLAN.minSeats)
  const [loadingPlan, setLoadingPlan] = useState(null)
  const [error, setError] = useState('')

  const isTeamAccount = !!profile?.org_id

  // Renamed from startTrial — this is a hard paywall now, no trial
  // period. seatCount is left as `undefined` (not `null` or `''`) for
  // individual plans, and only ever set for the team plan — check
  // api.js's subscribe() to make sure it forwards `undefined`/omits
  // the field entirely rather than coercing it to '' before it reaches
  // the backend (that coercion was the root cause of a previous
  // subscription-creation bug).
  const subscribe = async (planKey, seatCount) => {
    setLoadingPlan(planKey)
    setError('')
    try {
      const result = await api.subscribe(token, planKey, seatCount)
      window.location.href = result.authorization_url
    } catch (err) {
      setError(err.message)
      setLoadingPlan(null)
    }
  }

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate('/')}>
        <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Dashboard
      </button>
      <h1 style={s.title}>Choose your plan</h1>
      <p style={s.sub}>Full access starts immediately after payment.</p>

      {error && <p style={s.error}>{error}</p>}

      {!isTeamAccount && (
        <div style={s.grid}>
          {INDIVIDUAL_PLANS.map(plan => (
            <div key={plan.key} style={{ ...s.card, ...(plan.highlight ? s.cardHighlight : {}) }}>
              {plan.highlight && <span style={s.badge}>BEST VALUE</span>}
              <p style={s.planLabel}>{plan.label}</p>
              <p style={{ ...s.tagline, ...(plan.highlight ? {} : s.taglineMuted) }}>{plan.tagline}</p>
              <p style={s.price}>
                ₦{plan.price.toLocaleString()}<span style={s.unit}>{plan.unit}</span>
              </p>
              <ul style={s.benefitList}>
                {plan.benefits.map((b, i) => (
                  <li key={i} style={s.benefitItem}>
                    <span style={s.check}><Check size={13} strokeWidth={3} /></span> {b}
                  </li>
                ))}
              </ul>
              <button
                style={{ ...(plan.highlight ? s.btnHighlight : s.btn), ...(loadingPlan !== null ? s.btnDisabled : {}) }}
                onClick={() => subscribe(plan.key)}
                disabled={loadingPlan !== null}
              >
                {loadingPlan === plan.key ? 'Redirecting to payment...' : 'Subscribe now'}
              </button>
            </div>
          ))}
        </div>
      )}

      {isTeamAccount && (
        <div style={s.teamCard}>
          <p style={s.planLabel}>{TEAM_PLAN.label}</p>
          <p style={s.tagline}>{TEAM_PLAN.tagline}</p>
          <p style={s.price}>
            ₦{TEAM_PLAN.pricePerSeat.toLocaleString()}<span style={s.unit}>{TEAM_PLAN.unit}</span>
          </p>
          <ul style={s.benefitList}>
            {TEAM_PLAN.benefits.map((b, i) => (
              <li key={i} style={s.benefitItem}>
                <span style={s.check}><Check size={13} strokeWidth={3} /></span> {b}
              </li>
            ))}
          </ul>

          <div style={s.seatRow}>
            <label style={s.seatLabel}>Seats (min {TEAM_PLAN.minSeats})</label>
            <input
              type="number"
              min={TEAM_PLAN.minSeats}
              value={seats}
              onChange={e => setSeats(Math.max(TEAM_PLAN.minSeats, parseInt(e.target.value) || TEAM_PLAN.minSeats))}
              style={s.seatInput}
            />
          </div>
          <p style={s.seatTotal}>₦{(TEAM_PLAN.pricePerSeat * seats).toLocaleString()} / month total</p>

          {profile?.role !== 'admin' ? (
            <p style={s.adminNotice}>Only an org admin can manage billing for your team.</p>
          ) : (
            <button
              style={{ ...s.btnHighlight, ...(loadingPlan !== null ? s.btnDisabled : {}) }}
              onClick={() => subscribe(TEAM_PLAN.key, seats)}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === TEAM_PLAN.key ? 'Redirecting to payment...' : 'Subscribe now'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const s = {
  wrap:       { maxWidth: '1000px', margin: '0 auto', padding: '2.5rem 1.5rem', background: '#FFFFFF', minHeight: '100vh', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  back:       { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#8A8779', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0, fontFamily: 'inherit' },
  title:      { color: '#0A1A2F', margin: '0 0 8px', fontSize: '26px', fontWeight: 700, textAlign: 'center', fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  sub:        { color: '#8A8779', fontSize: '14px', textAlign: 'center', margin: '0 0 2.5rem' },
  error:      { color: '#B3453B', fontSize: '14px', textAlign: 'center', marginBottom: '1.5rem' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' },
  card:       { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '16px', padding: '1.75rem', display: 'flex', flexDirection: 'column', position: 'relative' },
  cardHighlight: { border: '1.5px solid #B8863B', boxShadow: '0 0 0 1px #B8863B', background: '#FFFFFF' },
  badge:      { position: 'absolute', top: '-11px', left: '50%', transform: 'translateX(-50%)', background: '#B8863B', color: '#fff', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', padding: '4px 12px', borderRadius: '20px' },
  planLabel:  { color: '#0A1A2F', fontSize: '18px', fontWeight: 700, margin: '0 0 2px', fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  tagline:    { color: '#8F6423', fontSize: '13px', fontWeight: 600, margin: '0 0 1rem' },
  taglineMuted:{ color: '#8A8779' },
  price:      { color: '#0A1A2F', fontSize: '32px', fontWeight: 700, margin: '0 0 1.25rem', fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  unit:       { color: '#8A8779', fontSize: '14px', fontWeight: 500 },
  benefitList:{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', flex: 1 },
  benefitItem:{ color: '#46443E', fontSize: '13px', lineHeight: 1.6, marginBottom: '8px', display: 'flex', gap: '8px' },
  check:      { color: '#3F6249', flexShrink: 0, display: 'flex', alignItems: 'center', marginTop: '2px' },
  btn:        { padding: '11px', borderRadius: '8px', background: '#FFFFFF', color: '#0A1A2F', border: '1px solid #D8D4C9', fontWeight: 600, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' },
  btnHighlight:{ padding: '11px', borderRadius: '8px', background: '#B8863B', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' },
  btnDisabled:{ opacity: 0.55, cursor: 'default' },
  teamCard:   { background: '#FFFFFF', border: '1.5px solid #B8863B', borderRadius: '16px', padding: '2rem', maxWidth: '440px', margin: '0 auto' },
  seatRow:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' },
  seatLabel:  { color: '#46443E', fontSize: '13px' },
  seatInput:  { width: '70px', padding: '8px', borderRadius: '6px', border: '1px solid #E5E2DB', background: '#FFFFFF', color: '#2B2A26', fontSize: '14px', textAlign: 'center', fontFamily: 'inherit' },
  seatTotal:  { color: '#8A8779', fontSize: '13px', margin: '0 0 1.5rem' },
  adminNotice:{ color: '#8F6423', fontSize: '13px', textAlign: 'center' },
}
