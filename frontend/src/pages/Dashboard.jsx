import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Dashboard({ token, onLogout }) {
  const [meetings, setMeetings] = useState([])
  const [agent, setAgent]       = useState(null)
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
    api.me(token).then(setAgent).catch(() => onLogout())
    fetchMeetings()
  }, [])

  const dealColor = (score) =>
    score === 'hot'  ? '#ff6b6b' :
    score === 'warm' ? '#ffd93d' : '#6c8fff'

  const dealBg = (score) =>
    score === 'hot'  ? '#2d1a1a' :
    score === 'warm' ? '#2a2210' : '#1a1a2d'

  const dealWidth = (score) =>
    score === 'hot'  ? '100%' :
    score === 'warm' ? '60%'  : '25%'

  return (
    <div style={s.wrap}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h2 style={s.title}>OSF Suite</h2>
          {agent && <p style={s.sub}>{agent.name} · {agent.email}</p>}
        </div>
        <div style={s.actions}>
          <button style={s.btnPrimary} onClick={() => navigate('/meeting')}>
            + New Meeting
          </button>
          <button style={s.btnGhost} onClick={() => navigate('/context')}>
            Company Context
          </button>
          <button style={s.btnGhost} onClick={fetchMeetings}>
            ↻ Refresh
          </button>
          <button style={s.btnGhost} onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>

      {/* Section title */}
      <h3 style={s.sectionTitle}>
        Recent Meetings {meetings.length > 0 && `(${meetings.length})`}
      </h3>

      {loading && <p style={s.muted}>Loading meetings...</p>}
      {error   && <p style={s.err}>{error}</p>}

      {/* Empty state */}
      {!loading && meetings.length === 0 && (
        <div style={s.emptyBox}>
          <p style={s.emptyTitle}>No completed meetings yet</p>
          <p style={s.emptySub}>
            Start a new meeting or upload a recording to see insights here.
          </p>
          <button style={s.btnPrimary} onClick={() => navigate('/meeting')}>
            + New Meeting
          </button>
        </div>
      )}

      {/* Meeting grid */}
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
                  background: score ? dealColor(score) : '#333',
                }} />
                <span style={{
                  ...s.dealText,
                  color: score ? dealColor(score) : '#555'
                }}>
                  {score ? `Deal is ${score}` : 'No analysis yet'}
                </span>
              </div>

              <p style={s.cardFooter}>View full report →</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const s = {
  wrap:        { maxWidth: '900px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' },
  title:       { color: '#fff', margin: 0, fontSize: '22px', fontWeight: 600 },
  sub:         { color: '#555', margin: '4px 0 0', fontSize: '13px' },
  actions:     { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  sectionTitle:{ color: '#aaa', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1rem' },
  muted:       { color: '#555', fontSize: '14px' },
  err:         { color: '#ff6b6b', fontSize: '14px' },
  emptyBox:    { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center' },
  emptyTitle:  { color: '#fff', fontSize: '16px', fontWeight: 600, margin: '0 0 8px' },
  emptySub:    { color: '#555', fontSize: '14px', margin: '0 0 1.5rem', lineHeight: 1.6 },
  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' },
  card:        { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.25rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '12px', transition: 'border-color 0.15s' },
  cardTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardDate:    { color: '#555', fontSize: '12px' },
  badge:       { fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  dealRow:     { position: 'relative', height: '30px', background: '#111', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '0 10px' },
  dealBarFill: { position: 'absolute', left: 0, top: 0, height: '100%', opacity: 0.18, borderRadius: '6px', transition: 'width 0.4s ease' },
  dealText:    { fontSize: '13px', fontWeight: 600, position: 'relative', zIndex: 1 },
  cardFooter:  { color: '#444', fontSize: '12px', margin: 0 },
  btnPrimary:  { padding: '9px 16px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
  btnGhost:    { padding: '9px 16px', borderRadius: '8px', background: 'transparent', color: '#aaa', border: '1px solid #2a2a2a', cursor: 'pointer', fontSize: '13px' },
}