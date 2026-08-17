import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { api } from '../api'

const PLAN_LABELS = {
  individual_2week:  '2 Weeks',
  individual_1month: '1 Month',
  individual_1year:  '1 Year',
  team_monthly:      'Team',
}

// CHANGED: "trialing" removed — the hard-paywall migration means
// /billing/status can no longer return that status or a
// trial_ends_at date. Only these three statuses are possible now.
const STATUS_COPY = {
  active:    { label: 'Active',        color: '#3F6249' },
  past_due:  { label: 'Payment issue', color: '#8F6423' },
  expired:   { label: 'Expired',       color: '#B3453B' },
}

export default function Billing({ token, profile }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.billingStatus(token)
      .then(setStatus)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const formatDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate({ to: '/' })}>
        <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Dashboard
      </button>
      <h1 style={s.title}>Billing</h1>

      {error && <p style={s.error}>{error}</p>}

      {loading && (
        <div style={s.card}>
          {[0, 1, 2].map(i => (
            <div key={i} style={s.row}>
              <div className="osf-billing-skel" style={{ width: '70px', height: '11px' }} />
              <div className="osf-billing-skel" style={{ width: '110px', height: '11px' }} />
            </div>
          ))}
        </div>
      )}

      {!loading && status && !status.has_subscription && (
        <div style={s.emptyBox}>
          <p style={s.emptyText}>No active plan yet.</p>
          <button style={s.btn} onClick={() => navigate({ to: '/pricing' })}>Choose a plan</button>
        </div>
      )}

      {!loading && status?.has_subscription && (
        <div style={s.card}>
          <div style={s.row}>
            <span style={s.label}>Plan</span>
            <span style={s.value}>
              {PLAN_LABELS[status.plan] || status.plan}
              {status.seats ? ` · ${status.seats} seats` : ''}
              {status.currency === 'USD' ? ' · USD' : ''}
            </span>
          </div>
          <div style={s.row}>
            <span style={s.label}>Status</span>
            <span style={{ ...s.statusBadge, color: STATUS_COPY[status.status]?.color || '#46443E' }}>
              {STATUS_COPY[status.status]?.label || status.status}
            </span>
          </div>
          <div style={s.row}>
            <span style={s.label}>Next charge</span>
            <span style={s.value}>{formatDate(status.current_period_end)}</span>
          </div>

          {!status.has_access && (
            <p style={s.warning}>
              Your access has ended. <button style={s.linkBtn} onClick={() => navigate({ to: '/pricing' })}>Choose a plan</button> to continue.
            </p>
          )}

          {/* No cancel/change-plan action here yet, the backend doesn't
              have a cancellation endpoint built. Point to support in the
              meantime rather than wiring a button to nothing. */}
          <p style={s.supportNote}>
            Need to change or cancel your plan? Email support. Self-service management is coming soon.
          </p>
        </div>
      )}

      <style>{`
        @keyframes osfBillingShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
        .osf-billing-skel {
          border-radius: 4px;
          background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
          background-size: 400% 100%;
          animation: osfBillingShimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .osf-billing-skel { animation: none; } }
      `}</style>
    </div>
  )
}

const s = {
  wrap:      { maxWidth: '520px', margin: '0 auto', padding: '2.5rem 1.5rem', background: '#FFFFFF', minHeight: '100vh', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  back:      { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#8A8779', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0, fontFamily: 'inherit' },
  title:     { color: '#0A1A2F', margin: '0 0 2rem', fontSize: '22px', fontWeight: 600, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  error:     { color: '#B3453B', fontSize: '14px' },
  emptyBox:  { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '2rem', textAlign: 'center' },
  emptyText: { color: '#8A8779', fontSize: '14px', margin: '0 0 1.25rem' },
  card:      { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '14px', padding: '1.75rem' },
  row:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #E5E2DB' },
  label:     { color: '#8A8779', fontSize: '13px' },
  value:     { color: '#0A1A2F', fontSize: '14px', fontWeight: 600 },
  statusBadge:{ fontSize: '13px', fontWeight: 700 },
  warning:   { color: '#8F6423', fontSize: '13px', margin: '1.25rem 0 0', lineHeight: 1.6 },
  linkBtn:   { background: 'none', border: 'none', color: '#8F6423', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', padding: 0, fontFamily: 'inherit' },
  supportNote:{ color: '#8A8779', fontSize: '12px', margin: '1.5rem 0 0', lineHeight: 1.6 },
  btn:       { padding: '11px 20px', borderRadius: '8px', background: '#0A1A2F', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit' },
}
