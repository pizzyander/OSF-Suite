import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const INDIVIDUAL_PLANS = [
  {
    key: 'individual_2week',
    label: '2 Weeks',
    price: 20,
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
    price: 38,
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
    price: 432,
    unit: '/ year',
    tagline: 'Best value — save 5%',
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
  pricePerSeat: 99,
  unit: '/ seat / month',
  minSeats: 5,
  tagline: 'For sales teams',
  benefits: [
    'Everything in the individual plan, for every rep',
    'Shared company context across your whole team',
    'Manager dashboards — deal health & coaching trends',
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

  const startTrial = async (planKey, seatCount = null) => {
    setLoadingPlan(planKey)
    setError('')
    try {
      const result = await api.startTrial(token, planKey, seatCount)
      window.location.href = result.authorization_url
    } catch (err) {
      setError(err.message)
      setLoadingPlan(null)
    }
  }

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate('/')}>← Dashboard</button>
      <h1 style={s.title}>Choose your plan</h1>
      <p style={s.sub}>7-day free trial on every plan. Your card is saved but not charged until the trial ends.</p>

      {error && <p style={s.error}>{error}</p>}

      {!isTeamAccount && (
        <div style={s.grid}>
          {INDIVIDUAL_PLANS.map(plan => (
            <div key={plan.key} style={{ ...s.card, ...(plan.highlight ? s.cardHighlight : {}) }}>
              {plan.highlight && <span style={s.badge}>BEST VALUE</span>}
              <p style={s.planLabel}>{plan.label}</p>
              <p style={s.tagline}>{plan.tagline}</p>
              <p style={s.price}>
                ${plan.price}<span style={s.unit}>{plan.unit}</span>
              </p>
              <ul style={s.benefitList}>
                {plan.benefits.map((b, i) => (
                  <li key={i} style={s.benefitItem}>
                    <span style={s.check}>✓</span> {b}
                  </li>
                ))}
              </ul>
              <button
                style={plan.highlight ? s.btnHighlight : s.btn}
                onClick={() => startTrial(plan.key)}
                disabled={loadingPlan !== null}
              >
                {loadingPlan === plan.key ? 'Starting...' : 'Start free trial'}
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
            ${TEAM_PLAN.pricePerSeat}<span style={s.unit}>{TEAM_PLAN.unit}</span>
          </p>
          <ul style={s.benefitList}>
            {TEAM_PLAN.benefits.map((b, i) => (
              <li key={i} style={s.benefitItem}>
                <span style={s.check}>✓</span> {b}
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
          <p style={s.seatTotal}>${TEAM_PLAN.pricePerSeat * seats} / month total</p>

          {profile?.role !== 'admin' ? (
            <p style={s.adminNotice}>Only an org admin can manage billing for your team.</p>
          ) : (
            <button
              style={s.btnHighlight}
              onClick={() => startTrial(TEAM_PLAN.key, seats)}
              disabled={loadingPlan !== null}
            >
              {loadingPlan === TEAM_PLAN.key ? 'Starting...' : 'Start free trial'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const s = {
  wrap:       { maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  back:       { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0 },
  title:      { color: '#fff', margin: '0 0 8px', fontSize: '26px', fontWeight: 700, textAlign: 'center' },
  sub:        { color: '#888', fontSize: '14px', textAlign: 'center', margin: '0 0 2.5rem' },
  error:      { color: '#ff6b6b', fontSize: '14px', textAlign: 'center', marginBottom: '1.5rem' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' },
  card:       { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '16px', padding: '1.75rem', display: 'flex', flexDirection: 'column', position: 'relative' },
  cardHighlight: { border: '1.5px solid #6c5ce7', boxShadow: '0 0 0 1px #6c5ce7' },
  badge:      { position: 'absolute', top: '-11px', left: '50%', transform: 'translateX(-50%)', background: '#6c5ce7', color: '#fff', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', padding: '4px 12px', borderRadius: '20px' },
  planLabel:  { color: '#fff', fontSize: '18px', fontWeight: 700, margin: '0 0 2px' },
  tagline:    { color: '#6c5ce7', fontSize: '13px', fontWeight: 600, margin: '0 0 1rem' },
  price:      { color: '#fff', fontSize: '32px', fontWeight: 700, margin: '0 0 1.25rem' },
  unit:       { color: '#666', fontSize: '14px', fontWeight: 500 },
  benefitList:{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', flex: 1 },
  benefitItem:{ color: '#ccc', fontSize: '13px', lineHeight: 1.6, marginBottom: '8px', display: 'flex', gap: '8px' },
  check:      { color: '#6bffb8', fontWeight: 700, flexShrink: 0 },
  btn:        { padding: '11px', borderRadius: '8px', background: '#2a2a2a', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  btnHighlight:{ padding: '11px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  teamCard:   { background: '#1a1a1a', border: '1.5px solid #6c5ce7', borderRadius: '16px', padding: '2rem', maxWidth: '440px', margin: '0 auto' },
  seatRow:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' },
  seatLabel:  { color: '#aaa', fontSize: '13px' },
  seatInput:  { width: '70px', padding: '8px', borderRadius: '6px', border: '1px solid #2a2a2a', background: '#111', color: '#fff', fontSize: '14px', textAlign: 'center' },
  seatTotal:  { color: '#666', fontSize: '13px', margin: '0 0 1.5rem' },
  adminNotice:{ color: '#ffd93d', fontSize: '13px', textAlign: 'center' },
}
