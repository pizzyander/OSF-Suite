import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Coaching({ token }) {
  const navigate = useNavigate()
  const [plan, setPlan] = useState(null)
  const [patterns, setPatterns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.getCoachingPlan(token), api.getWinningPatterns(token)])
      .then(([planData, patternsData]) => {
        setPlan(planData.plan)
        setPatterns(patternsData.patterns || [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const categoryLabel = (c) => ({
    objection_handling: 'Objection handling',
    discovery: 'Discovery',
    closing: 'Closing',
    buying_signal: 'Buying signal',
  }[c] || c)

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate('/')}>← Dashboard</button>
      <h2 style={s.title}>Coaching</h2>

      {loading && <p style={s.muted}>Loading...</p>}
      {error && <p style={s.err}>{error}</p>}

      <div style={s.section}>
        <h3 style={s.sectionTitle}>This week's plan</h3>
        {!loading && !plan && (
          <div style={s.emptyBox}>
            <p style={s.emptyText}>
              No coaching plan yet — this generates automatically once you've completed a couple
              of meetings. Check back after your next few calls.
            </p>
          </div>
        )}
        {plan && (
          <div style={s.planCard}>
            <div style={s.planMeta}>
              <span>{plan.meetings_analyzed} meeting{plan.meetings_analyzed !== 1 ? 's' : ''} analyzed</span>
              {plan.avg_coaching_score != null && <span>Avg score: {plan.avg_coaching_score}/100</span>}
            </div>
            <p style={s.planText}>{plan.plan_text}</p>
          </div>
        )}
      </div>

      <div style={s.section}>
        <h3 style={s.sectionTitle}>Proven techniques from your team</h3>
        {!loading && patterns.length === 0 && (
          <p style={s.muted}>Nothing captured yet — this fills in as strong calls happen.</p>
        )}
        {patterns.map(p => (
          <div key={p.id} style={s.patternCard}>
            <div style={s.patternTop}>
              <span style={s.patternCategory}>{categoryLabel(p.category)}</span>
              <span style={s.patternSource}>from {p.source_agent_name}</span>
            </div>
            <p style={s.patternText}>{p.technique}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

const s = {
  wrap:        { maxWidth: '760px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  back:        { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0 },
  title:       { color: '#fff', margin: '0 0 2rem', fontSize: '22px', fontWeight: 600 },
  muted:       { color: '#555', fontSize: '14px' },
  err:         { color: '#ff6b6b', fontSize: '14px' },
  section:     { marginBottom: '2.5rem' },
  sectionTitle:{ color: '#aaa', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1rem' },
  emptyBox:    { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '2rem', textAlign: 'center' },
  emptyText:   { color: '#666', fontSize: '14px', lineHeight: 1.6, margin: 0 },
  planCard:    { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '1.5rem' },
  planMeta:    { display: 'flex', gap: '16px', color: '#6c5ce7', fontSize: '12px', fontWeight: 600, marginBottom: '1rem' },
  planText:    { color: '#ddd', fontSize: '14px', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-line' },
  patternCard: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.1rem 1.25rem', marginBottom: '10px' },
  patternTop:  { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' },
  patternCategory: { color: '#6bffb8', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  patternSource:   { color: '#555', fontSize: '12px' },
  patternText: { color: '#ccc', fontSize: '14px', lineHeight: 1.6, margin: 0 },
}
