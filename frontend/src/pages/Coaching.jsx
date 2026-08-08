import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
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
      <button style={s.back} onClick={() => navigate({ to: '/' })}>
        <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Dashboard
      </button>
      <h2 style={s.title}>Coaching</h2>

      {error && <p style={s.err}>{error}</p>}

      <div style={s.section}>
        <h3 style={s.sectionTitle}>This week's plan</h3>
        {loading && (
          <div style={s.planCard}>
            <div className="osf-coach-skel" style={{ width: '160px', height: '10px', marginBottom: '14px' }} />
            <div className="osf-coach-skel" style={{ width: '95%', height: '11px', marginBottom: '8px' }} />
            <div className="osf-coach-skel" style={{ width: '88%', height: '11px', marginBottom: '8px' }} />
            <div className="osf-coach-skel" style={{ width: '60%', height: '11px' }} />
          </div>
        )}
        {!loading && !plan && (
          <div style={s.emptyBox}>
            <p style={s.emptyText}>
              No coaching plan yet. This generates automatically once you've completed a couple
              of meetings. Check back after your next few calls.
            </p>
          </div>
        )}
        {!loading && plan && (
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
        {loading && (
          <>
            {[0, 1].map(i => (
              <div key={i} style={s.patternCard}>
                <div className="osf-coach-skel" style={{ width: '110px', height: '9px', marginBottom: '10px' }} />
                <div className="osf-coach-skel" style={{ width: '90%', height: '11px' }} />
              </div>
            ))}
          </>
        )}
        {!loading && patterns.length === 0 && (
          <p style={s.muted}>Nothing captured yet. This fills in as strong calls happen.</p>
        )}
        {!loading && patterns.map(p => (
          <div key={p.id} style={s.patternCard}>
            <div style={s.patternTop}>
              <span style={s.patternCategory}>{categoryLabel(p.category)}</span>
              <span style={s.patternSource}>from {p.source_agent_name}</span>
            </div>
            <p style={s.patternText}>{p.technique}</p>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes osfCoachShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
        .osf-coach-skel {
          border-radius: 4px;
          background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
          background-size: 400% 100%;
          animation: osfCoachShimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .osf-coach-skel { animation: none; } }
      `}</style>
    </div>
  )
}

const s = {
  wrap:        { maxWidth: '760px', margin: '0 auto', padding: '2.5rem 1.5rem', background: '#FFFFFF', minHeight: '100vh', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  back:        { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#8A8779', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0, fontFamily: 'inherit' },
  title:       { color: '#0A1A2F', margin: '0 0 2rem', fontSize: '22px', fontWeight: 600, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  muted:       { color: '#8A8779', fontSize: '14px' },
  err:         { color: '#B3453B', fontSize: '14px' },
  section:     { marginBottom: '2.5rem' },
  sectionTitle:{ color: '#8A8779', fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1rem', fontFamily: "'IBM Plex Mono', monospace" },
  emptyBox:    { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '2rem', textAlign: 'center' },
  emptyText:   { color: '#8A8779', fontSize: '14px', lineHeight: 1.6, margin: 0 },
  planCard:    { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '1.5rem' },
  planMeta:    { display: 'flex', gap: '16px', color: '#8F6423', fontSize: '12px', fontWeight: 600, marginBottom: '1rem' },
  planText:    { color: '#2B2A26', fontSize: '14px', lineHeight: 1.8, margin: 0, whiteSpace: 'pre-line' },
  patternCard: { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '10px', padding: '1.1rem 1.25rem', marginBottom: '10px' },
  patternTop:  { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' },
  patternCategory: { color: '#3F6249', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' },
  patternSource:   { color: '#8A8779', fontSize: '12px' },
  patternText: { color: '#46443E', fontSize: '14px', lineHeight: 1.6, margin: 0 },
}
