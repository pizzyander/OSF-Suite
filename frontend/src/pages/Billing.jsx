import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

const PLAN_LABELS = {
  individual_2week:  '2 Weeks',
  individual_1month: '1 Month',
  individual_1year:  '1 Year',
  team_monthly:      'Team',
}

const STATUS_COPY = {
  trialing:  { label: 'Free trial',     color: '#6c8fff' },
  active:    { label: 'Active',         color: '#6bffb8' },
  past_due:  { label: 'Payment issue',  color: '#ffd93d' },
  expired:   { label: 'Expired',        color: '#ff6b6b' },
  cancelled: { label: 'Cancelled',      color: '#666' },
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
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate('/')}>← Dashboard</button>
      <h1 style={s.title}>Billing</h1>

      {loading && <p style={s.muted}>Loading...</p>}
      {error && <p style={s.error}>{error}</p>}

      {!loading && status && !status.has_subscription && (
        <div style={s.emptyBox}>
          <p style={s.emptyText}>No active plan yet.</p>
          <button style={s.btn} onClick={() => navigate('/pricing')}>Choose a plan</button>
        </div>
      )}

      {!loading && status?.has_subscription && (
        <div style={s.card}>
          <div style={s.row}>
            <span style={s.label}>Plan</span>
            <span style={s.value}>
              {PLAN_LABELS[status.plan] || status.plan}
              {status.seats ? ` · ${status.seats} seats` : ''}
            </span>
          </div>
          <div style={s.row}>
            <span style={s.label}>Status</span>
            <span style={{ ...s.statusBadge, color: STATUS_COPY[status.status]?.color || '#aaa' }}>
              {STATUS_COPY[status.status]?.label || status.status}
            </span>
          </div>
          {status.status === 'trialing' && (
            <div style={s.row}>
              <span style={s.label}>Trial ends</span>
              <span style={s.value}>{formatDate(status.trial_ends_at)}</span>
            </div>
          )}
          <div style={s.row}>
            <span style={s.label}>{status.status === 'trialing' ? 'First charge' : 'Next charge'}</span>
            <span style={s.value}>{formatDate(status.current_period_end)}</span>
          </div>

          {!status.has_access && (
            <p style={s.warning}>
              Your access has ended. <button style={s.linkBtn} onClick={() => navigate('/pricing')}>Choose a plan</button> to continue.
            </p>
          )}

          {/* No cancel/change-plan action here yet — the backend doesn't
              have a cancellation endpoint built. Point to support in the
              meantime rather than wiring a button to nothing. */}
          <p style={s.supportNote}>
            Need to change or cancel your plan? Email support — self-service management is coming soon.
          </p>
        </div>
      )}
    </div>
  )
}

const s = {
  wrap:      { maxWidth: '520px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  back:      { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0 },
  title:     { color: '#fff', margin: '0 0 2rem', fontSize: '22px', fontWeight: 600 },
  muted:     { color: '#555', fontSize: '14px' },
  error:     { color: '#ff6b6b', fontSize: '14px' },
  emptyBox:  { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '2rem', textAlign: 'center' },
  emptyText: { color: '#888', fontSize: '14px', margin: '0 0 1.25rem' },
  card:      { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '14px', padding: '1.75rem' },
  row:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #222' },
  label:     { color: '#666', fontSize: '13px' },
  value:     { color: '#fff', fontSize: '14px', fontWeight: 600 },
  statusBadge:{ fontSize: '13px', fontWeight: 700 },
  warning:   { color: '#ffd93d', fontSize: '13px', margin: '1.25rem 0 0', lineHeight: 1.6 },
  linkBtn:   { background: 'none', border: 'none', color: '#6c5ce7', textDecoration: 'underline', cursor: 'pointer', fontSize: '13px', padding: 0 },
  supportNote:{ color: '#555', fontSize: '12px', margin: '1.5rem 0 0', lineHeight: 1.6 },
  btn:       { padding: '11px 20px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
}
