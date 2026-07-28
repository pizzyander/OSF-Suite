import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, ArrowRight } from 'lucide-react'
import { api } from '../../api'

export default function Dashboard({ token, profile, onLogout }) {
  const [meetings, setMeetings] = useState([])
  // Seed from the `profile` prop if App.jsx already fetched it (avoids a
  // redundant /agents/me call on every dashboard load), falls back to
  // self-fetching so this component still works fine if ever rendered
  // standalone without that prop.
  const [agent, setAgent]       = useState(profile || null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const navigate = useNavigate()

  const fetchMeetings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getMeetings(token)
      setMeetings(data.meetings || [])
    } catch (err) {
      setError(`Failed to load meetings: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!profile) {
      api.me(token).then(setAgent).catch(() => onLogout())
    }
    fetchMeetings()
  }, [])

  const dealColor = (score) =>
    score === 'hot'  ? '#B3453B' :
    score === 'warm' ? '#8F6423' : '#2C5478'

  const dealBg = (score) =>
    score === 'hot'  ? '#F7E9E7' :
    score === 'warm' ? '#F6ECD9' : '#EAF0F5'

  const dealWidth = (score) =>
    score === 'hot'  ? '100%' :
    score === 'warm' ? '60%'  : '25%'

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>OSF<span style={s.titleAccent}>-Suite</span></h2>
          {agent && (
            <p style={s.sub}>
              {agent.name} · {agent.email}
              {agent.org_name && (
                <>
                  {' · '}
                  <span style={s.orgBadge}>{agent.org_name}</span>
                  {agent.role && <span style={s.roleTag}> ({agent.role})</span>}
                </>
              )}
            </p>
          )}
        </div>
        <div style={s.actions}>
          <button style={s.btnPrimary} onClick={() => navigate('/meeting')}>
            + New meeting
          </button>
          <button style={s.btnGhost} onClick={() => navigate('/coaching')}>
            Coaching
          </button>
          <button style={s.btnGhost} onClick={() => navigate('/pricing')}>
            Pricing
          </button>
          <button style={s.btnGhost} onClick={() => navigate('/billing')}>
            Billing
          </button>
          {(agent?.role === 'admin' || agent?.role === 'manager') && (
            <button style={s.btnGhost} onClick={() => navigate('/manager')}>
              Team performance
            </button>
          )}
          {agent?.role === 'admin' && (
            <button style={s.btnGhost} onClick={() => navigate('/team')}>
              Team
            </button>
          )}
          <button style={s.btnGhost} onClick={() => navigate('/context')}>
            Manage company context
          </button>
          <button style={s.btnGhostIcon} onClick={fetchMeetings} aria-label="Refresh meetings">
            <RefreshCw size={14} />
          </button>
          <button style={s.btnGhost} onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>

      {/* Section title */}
      <h3 style={s.sectionTitle}>
        Recent meetings {meetings.length > 0 && `(${meetings.length})`}
      </h3>

      {error && <p style={s.err}>{error}</p>}

      {/* Loading skeleton */}
      {loading && (
        <div style={s.grid}>
          {[0, 1, 2].map(i => (
            <div key={i} style={s.card}>
              <div style={s.cardTop}>
                <div className="osf-dash-skel" style={{ ...s.skel, width: '90px' }} />
                <div className="osf-dash-skel" style={{ ...s.skel, width: '46px', borderRadius: '20px' }} />
              </div>
              <div className="osf-dash-skel" style={{ ...s.skel, height: '30px', borderRadius: '6px' }} />
              <div className="osf-dash-skel" style={{ ...s.skel, width: '60%' }} />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && meetings.length === 0 && (
        <div style={s.emptyBox}>
          <p style={s.emptyTitle}>No completed meetings yet</p>
          <p style={s.emptySub}>
            Start a new meeting or upload a recording to see insights here.
          </p>
          <button style={s.btnPrimary} onClick={() => navigate('/meeting')}>
            + New meeting
          </button>
        </div>
      )}

      {/* Meeting grid */}
      {!loading && meetings.length > 0 && (
        <div style={s.grid}>
          {meetings.map(m => {
            const score = m.deal_health
            const date  = new Date(m.created_at).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'short', year: 'numeric'
            })
            const time  = new Date(m.created_at).toLocaleTimeString('en-GB', {
              hour: '2-digit', minute: '2-digit'
            })

            return (
              <div
                key={m.meeting_id}
                style={s.card}
                onClick={() => navigate(`/meeting/${m.meeting_id}`)}
              >
                {/* Date + badge */}
                <div style={s.cardTop}>
                  <span style={s.cardDate}>{date} · {time}</span>
                  {score && (
                    <span style={{
                      ...s.badge,
                      background: dealBg(score),
                      color: dealColor(score)
                    }}>
                      {score.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Deal health bar */}
                <div style={s.dealRow}>
                  <div style={{
                    ...s.dealBarFill,
                    width: dealWidth(score),
                    background: score ? dealColor(score) : '#D8D4C9',
                  }} />
                  <span style={{
                    ...s.dealText,
                    color: score ? dealColor(score) : '#8A8779'
                  }}>
                    {score ? `Deal is ${score}` : 'No analysis yet'}
                  </span>
                </div>

                <p style={s.cardFooter}>View full report <ArrowRight size={12} style={{ verticalAlign: '-1px' }} /></p>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        @keyframes osfDashShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
        .osf-dash-skel {
          height: 11px; border-radius: 4px;
          background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
          background-size: 400% 100%;
          animation: osfDashShimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .osf-dash-skel { animation: none; } }
      `}</style>
    </div>
  )
}

const s = {
  wrap:        { maxWidth: '900px', margin: '0 auto', padding: '2.5rem 1.5rem', background: '#FFFFFF', minHeight: '100vh', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem', paddingBottom: '1.75rem', borderBottom: '1px solid #E5E2DB' },
  title:       { color: '#0A1A2F', margin: 0, fontSize: '20px', fontWeight: 700, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  titleAccent: { color: '#8F6423' },
  sub:         { color: '#8A8779', margin: '6px 0 0', fontSize: '13px' },
  orgBadge:    { color: '#1B3A5C', fontWeight: 600 },
  roleTag:     { color: '#8A8779' },
  actions:     { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' },
  sectionTitle:{ color: '#8A8779', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1rem', fontFamily: "'IBM Plex Mono', monospace" },
  err:         { color: '#B3453B', fontSize: '14px' },
  emptyBox:    { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center' },
  emptyTitle:  { color: '#0A1A2F', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' },
  emptySub:    { color: '#8A8779', fontSize: '14px', margin: '0 0 1.5rem', lineHeight: 1.6 },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' },
  card:        { background: '#FFFFFF', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '1.25rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'border-color 0.15s' },
  cardTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardDate:    { color: '#8A8779', fontSize: '12px' },
  badge:       { fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  dealRow:     { position: 'relative', height: '30px', background: '#F7F6F3', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '0 10px', border: '1px solid #E5E2DB' },
  dealBarFill: { position: 'absolute', left: 0, top: 0, height: '100%', opacity: 0.16, borderRadius: '6px', transition: 'width 0.4s ease' },
  dealText:    { fontSize: '13px', fontWeight: 600, position: 'relative', zIndex: 1 },
  cardFooter:  { color: '#8A8779', fontSize: '12px', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' },
  skel:        { height: '11px', borderRadius: '4px' },
  btnPrimary:  { padding: '9px 16px', borderRadius: '8px', background: '#0A1A2F', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' },
  btnGhost:    { padding: '9px 16px', borderRadius: '8px', background: 'transparent', color: '#46443E', border: '1px solid #E5E2DB', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' },
  btnGhostIcon:{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', background: 'transparent', color: '#46443E', border: '1px solid #E5E2DB', cursor: 'pointer' },
}
