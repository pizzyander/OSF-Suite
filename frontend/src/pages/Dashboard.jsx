import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Dashboard({ token, onLogout }) {
  const [meetings, setMeetings] = useState([])
  const [agent, setAgent]       = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.me(token).then(setAgent).catch(() => onLogout())
    api.getMeetings(token).then(d => setMeetings(d.meetings || []))
  }, [])

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>OSF Suite</h2>
          {agent && <p style={styles.sub}>{agent.email}</p>}
        </div>
        <div style={styles.actions}>
          <button style={styles.btnPrimary} onClick={() => navigate('/meeting')}>
            + New Meeting
          </button>
          <button style={styles.btnGhost} onClick={() => navigate('/context')}>
            Company Context
          </button>
          <button style={styles.btnGhost} onClick={onLogout}>
            Sign out
          </button>
        </div>
      </div>

      <h3 style={styles.sectionTitle}>Recent Meetings</h3>

      {meetings.length === 0
        ? <p style={styles.empty}>No completed meetings yet. Start one to see insights here.</p>
        : meetings.map(m => (
          <div key={m.meeting_id} style={styles.card}
               onClick={() => navigate(`/meeting?id=${m.meeting_id}`)}>
            <div style={styles.cardTop}>
              <span style={styles.cardDate}>
                {new Date(m.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}
              </span>
              <span style={{
                ...styles.badge,
                background: m.deal_health === 'hot' ? '#2d1a1a' : m.deal_health === 'warm' ? '#2a2210' : '#1a1a2d',
                color:      m.deal_health === 'hot' ? '#ff6b6b' : m.deal_health === 'warm' ? '#ffd93d' : '#6c8fff',
              }}>
                {m.deal_health?.toUpperCase() || 'N/A'}
              </span>
            </div>
            <p style={styles.summary}>{m.summary || 'No summary available'}</p>
          </div>
        ))
      }
    </div>
  )
}

const styles = {
  wrap:        { maxWidth: '860px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' },
  title:       { color: '#fff', margin: 0, fontSize: '22px', fontWeight: 600 },
  sub:         { color: '#555', margin: '4px 0 0', fontSize: '13px' },
  actions:     { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  sectionTitle:{ color: '#aaa', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1rem' },
  empty:       { color: '#555', fontSize: '14px' },
  card:        { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', marginBottom: '12px', cursor: 'pointer' },
  cardTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  cardDate:    { color: '#666', fontSize: '13px' },
  badge:       { fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.05em' },
  summary:     { color: '#bbb', fontSize: '14px', margin: 0, lineHeight: 1.5 },
  btnPrimary:  { padding: '9px 16px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
  btnGhost:    { padding: '9px 16px', borderRadius: '8px', background: 'transparent', color: '#aaa', border: '1px solid #2a2a2a', cursor: 'pointer', fontSize: '13px' },
}