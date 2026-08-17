import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { api } from '../api'

export default function ManagerDashboard({ token, profile }) {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [statsData, meetingsData] = await Promise.all([
        api.getTeamStats(token),
        api.getTeamMeetings(token, 30),
      ])
      setStats(statsData)
      setMeetings(meetingsData.meetings || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const dealColor = (score) =>
    score === 'hot'  ? '#B3453B' :
    score === 'warm' ? '#8F6423' : '#2C5478'

  const dealBg = (score) =>
    score === 'hot'  ? '#F7E9E7' :
    score === 'warm' ? '#F6ECD9' : '#EAF0F5'

  if (profile && !['admin', 'manager'].includes(profile.role)) {
    return (
      <div style={s.wrap}>
        <p style={s.err}>Only managers and admins can view team performance.</p>
        <button style={s.btnGhost} onClick={() => navigate({ to: '/' })}>
          <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Dashboard
        </button>
      </div>
    )
  }

  const totalHealthCount = stats
    ? stats.deal_health_counts.hot + stats.deal_health_counts.warm + stats.deal_health_counts.cold
    : 0

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate({ to: '/' })}>
        <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Dashboard
      </button>
      <h2 style={s.title}>Team performance</h2>
      <p style={s.sub}>
        {profile?.role === 'admin' ? `${profile.org_name}, all reps` : 'Your direct reports'}
      </p>

      {error && <p style={s.err}>{error}</p>}

      {loading && (
        <>
          <div style={s.statRow}>
            {[0, 1, 2].map(i => (
              <div key={i} style={s.statCard}>
                <div className="osf-mgr-skel" style={{ height: '26px', width: '50%', marginBottom: '10px' }} />
                <div className="osf-mgr-skel" style={{ height: '10px', width: '70%' }} />
              </div>
            ))}
          </div>
          <div style={s.section}>
            <h3 style={s.sectionTitle}>By rep</h3>
            {[0, 1].map(i => (
              <div key={i} style={s.repRow}>
                <div style={{ flex: 1 }}>
                  <div className="osf-mgr-skel" style={{ height: '11px', width: '120px', marginBottom: '8px' }} />
                  <div className="osf-mgr-skel" style={{ height: '9px', width: '160px' }} />
                </div>
                <div className="osf-mgr-skel" style={{ height: '18px', width: '50px' }} />
              </div>
            ))}
          </div>
        </>
      )}

      {stats && !loading && (
        <>
          <div style={s.statRow}>
            <StatCard label="Meetings analyzed" value={stats.total_meetings} />
            <StatCard label="Avg coaching score" value={stats.avg_coaching_score ?? 'N/A'} suffix={stats.avg_coaching_score ? '/100' : ''} />
            <StatCard label="Active reps" value={stats.per_rep.length} />
          </div>

          {totalHealthCount > 0 && (
            <div style={s.section}>
              <h3 style={s.sectionTitle}>Deal health across the team</h3>
              <div style={s.healthBarWrap}>
                {['hot', 'warm', 'cold'].map(k => {
                  const pct = totalHealthCount ? (stats.deal_health_counts[k] / totalHealthCount) * 100 : 0
                  if (pct === 0) return null
                  return (
                    <div key={k} style={{ ...s.healthSegment, width: `${pct}%`, background: dealColor(k) }} title={`${k}: ${stats.deal_health_counts[k]}`} />
                  )
                })}
              </div>
              <div style={s.healthLegend}>
                {['hot', 'warm', 'cold'].map(k => (
                  <span key={k} style={s.legendItem}>
                    <span style={{ ...s.legendDot, background: dealColor(k) }} />
                    {k} ({stats.deal_health_counts[k]})
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={s.section}>
            <h3 style={s.sectionTitle}>By rep</h3>
            {stats.per_rep.map(rep => (
              <div key={rep.agent_id} style={s.repRow}>
                <div>
                  <p style={s.repName}>{rep.name}</p>
                  <p style={s.repMeta}>{rep.meeting_count} meeting{rep.meeting_count !== 1 ? 's' : ''} analyzed</p>
                </div>
                <div style={s.repStats}>
                  <span style={s.repScore}>{rep.avg_coaching_score ?? 'N/A'}<span style={s.repScoreSuffix}>/100</span></span>
                  {rep.latest_deal_health && (
                    <span style={{ ...s.badge, background: dealBg(rep.latest_deal_health), color: dealColor(rep.latest_deal_health) }}>
                      {rep.latest_deal_health.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={s.section}>
        <h3 style={s.sectionTitle}>Recent team meetings</h3>
        {meetings.length === 0 && !loading && <p style={s.muted}>No completed meetings yet.</p>}
        <div style={s.grid}>
          {meetings.map(m => {
            const date = new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            return (
              <div key={m.meeting_id} style={s.card} onClick={() => navigate({ to: '/meeting/$id', params: { id: m.meeting_id } })}>
                <div style={s.cardTop}>
                  <span style={s.cardAgent}>{m.agent_name}</span>
                  {m.deal_health && (
                    <span style={{ ...s.badge, background: dealBg(m.deal_health), color: dealColor(m.deal_health) }}>
                      {m.deal_health.toUpperCase()}
                    </span>
                  )}
                </div>
                <p style={s.cardDate}>{date}</p>
                {m.coaching_score != null && <p style={s.cardScore}>{m.coaching_score}/100 coaching score</p>}
                <p style={s.cardFooter}>View full report <ArrowRight size={11} style={{ verticalAlign: '-1px' }} /></p>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes osfMgrShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
        .osf-mgr-skel {
          border-radius: 4px;
          background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
          background-size: 400% 100%;
          animation: osfMgrShimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .osf-mgr-skel { animation: none; } }
      `}</style>
    </div>
  )
}

function StatCard({ label, value, suffix = '' }) {
  return (
    <div style={s.statCard}>
      <p style={s.statValue}>{value}{suffix && <span style={s.statSuffix}>{suffix}</span>}</p>
      <p style={s.statLabel}>{label}</p>
    </div>
  )
}

const s = {
  wrap:        { maxWidth: '900px', margin: '0 auto', padding: '2.5rem 1.5rem', background: '#FFFFFF', minHeight: '100vh', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  back:        { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#8A8779', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0, fontFamily: 'inherit' },
  title:       { color: '#0A1A2F', margin: '0 0 4px', fontSize: '22px', fontWeight: 600, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  sub:         { color: '#8F6423', fontSize: '13px', fontWeight: 600, margin: '0 0 2rem' },
  muted:       { color: '#8A8779', fontSize: '14px' },
  err:         { color: '#B3453B', fontSize: '14px', marginBottom: '1rem' },
  btnGhost:    { display: 'inline-flex', alignItems: 'center', padding: '9px 16px', borderRadius: '8px', background: 'transparent', color: '#46443E', border: '1px solid #E5E2DB', cursor: 'pointer', fontSize: '13px', fontFamily: 'inherit' },

  statRow:     { display: 'flex', gap: '12px', marginBottom: '2rem', flexWrap: 'wrap' },
  statCard:    { flex: '1 1 160px', background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '1.25rem' },
  statValue:   { color: '#0A1A2F', fontSize: '28px', fontWeight: 700, margin: '0 0 4px', fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  statSuffix:  { color: '#8A8779', fontSize: '15px', fontWeight: 500 },
  statLabel:   { color: '#8A8779', fontSize: '12px', margin: 0 },

  section:     { marginBottom: '2.5rem' },
  sectionTitle:{ color: '#8A8779', fontSize: '11.5px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1rem', fontFamily: "'IBM Plex Mono', monospace" },

  healthBarWrap:{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', background: '#F7F6F3', border: '1px solid #E5E2DB', marginBottom: '10px' },
  healthSegment:{ height: '100%' },
  healthLegend:{ display: 'flex', gap: '16px', flexWrap: 'wrap' },
  legendItem:  { display: 'flex', alignItems: 'center', gap: '6px', color: '#46443E', fontSize: '12px', textTransform: 'capitalize' },
  legendDot:   { width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block' },

  repRow:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFFFFF', border: '1px solid #E5E2DB', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '10px' },
  repName:     { color: '#0A1A2F', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' },
  repMeta:     { color: '#8A8779', fontSize: '12px', margin: 0 },
  repStats:    { display: 'flex', alignItems: 'center', gap: '12px' },
  repScore:    { color: '#0A1A2F', fontSize: '18px', fontWeight: 700, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  repScoreSuffix:{ color: '#8A8779', fontSize: '12px', fontWeight: 500 },

  badge:       { fontSize: '10px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', letterSpacing: '0.05em', whiteSpace: 'nowrap' },

  grid:        { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' },
  card:        { background: '#FFFFFF', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '1.1rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' },
  cardTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardAgent:   { color: '#0A1A2F', fontSize: '13px', fontWeight: 600 },
  cardDate:    { color: '#8A8779', fontSize: '12px', margin: 0 },
  cardScore:   { color: '#8F6423', fontSize: '12px', fontWeight: 600, margin: 0 },
  cardFooter:  { color: '#8A8779', fontSize: '11px', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '3px' },
}
