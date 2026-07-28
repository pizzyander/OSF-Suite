import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { api } from '../api'

export default function MeetingDetail({ token }) {
  const { id }  = useParams()
  const navigate = useNavigate()
  const [meeting, setMeeting] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    api.getResults(token, id)
      .then(setMeeting)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div style={s.wrap}>
      <div style={s.summaryBox}>
        <div className="osf-detail-skel" style={{ width: '40%', height: '13px', marginBottom: '12px' }} />
        <div className="osf-detail-skel" style={{ width: '95%', height: '11px', marginBottom: '8px' }} />
        <div className="osf-detail-skel" style={{ width: '80%', height: '11px' }} />
      </div>
      <style>{`
        @keyframes osfDetailShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
        .osf-detail-skel {
          border-radius: 4px;
          background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
          background-size: 400% 100%;
          animation: osfDetailShimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .osf-detail-skel { animation: none; } }
      `}</style>
    </div>
  )
  if (error)   return <div style={s.wrap}><p style={s.err}>{error}</p></div>
  if (!meeting) return null

  const mi = meeting.insights?.meeting_intelligence
  const co = meeting.insights?.coaching

  const date = new Date(meeting.created_at).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
  const time = new Date(meeting.created_at).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit'
  })

  const dealColor = (score) => ({
    background: score === 'hot'  ? '#F7E9E7' :
                score === 'warm' ? '#F6ECD9' : '#EAF0F5',
    color:      score === 'hot'  ? '#B3453B' :
                score === 'warm' ? '#8F6423' : '#2C5478',
  })

  const scorePillColor = (score) => ({
    background: score >= 7 ? '#F1F5F1' : score >= 4 ? '#F6ECD9' : '#F7E9E7',
    color:      score >= 7 ? '#3F6249' : score >= 4 ? '#8F6423' : '#B3453B',
  })

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate('/')}>
        <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> All meetings
      </button>

      {/* Meeting header */}
      <div style={s.meetingHeader}>
        <div>
          <h2 style={s.title}>Meeting report</h2>
          <p style={s.date}>{date} at {time}</p>
        </div>
        {mi?.deal_health?.score && (
          <span style={{ ...s.dealBadge, ...dealColor(mi.deal_health.score) }}>
            {mi.deal_health.score.toUpperCase()}
          </span>
        )}
      </div>

      {/* Summary */}
      {mi?.summary && (
        <div style={s.summaryBox}>
          <p style={s.summaryText}>{mi.summary}</p>
        </div>
      )}

      {/* Coaching grade */}
      {co?.overall_grade && (
        <div style={s.gradeRow}>
          <div style={s.gradeBox}>
            <span style={s.gradeNum}>{co.overall_grade.score_out_of_100}</span>
            <span style={s.gradeLabel}>/100</span>
          </div>
          <p style={s.gradeHeadline}>{co.overall_grade.headline_summary}</p>
        </div>
      )}

      {/* Metrics row */}
      {co?.metrics && (
        <div style={s.metricsRow}>
          <Metric label="Agent talk"  value={`${co.metrics.agent_talk_ratio_percentage}%`} />
          <Metric label="Client talk" value={`${co.metrics.client_talk_ratio_percentage}%`} />
          <Metric label="Open Qs"     value={co.metrics.open_ended_questions_count} />
          <Metric label="Closed Qs"   value={co.metrics.closed_questions_count} />
        </div>
      )}

      <div style={s.cols}>
        <div style={s.col}>
          {/* Deal health */}
          {mi?.deal_health && (
            <Section title="Deal health">
              <p style={s.bodyText}>{mi.deal_health.reasoning}</p>
              <List items={mi.deal_health.next_steps} label="Next steps" />
            </Section>
          )}

          {/* Buying signals */}
          <Section title="Buying signals">
            <List items={mi?.buying_signals} />
          </Section>

          {/* Pain points */}
          <Section title="Client pain points">
            <List items={mi?.client_pain_points} />
          </Section>

          {/* Action items */}
          <Section title="Action items">
            {mi?.action_items?.map((a, i) => (
              <div key={i} style={s.actionItem}>
                <span style={s.ownerBadge}>{a.owner}</span>
                <span style={s.actionText}>{a.task}</span>
                {a.deadline && <span style={s.deadline}>{a.deadline}</span>}
              </div>
            ))}
          </Section>

          {/* Client personality */}
          {mi?.client_personality && (
            <Section title="Client personality">
              <p style={s.metaLabel}>Communication style</p>
              <p style={s.bodyText}>{mi.client_personality.communication_style}</p>
              <p style={s.metaLabel}>Decision making</p>
              <p style={s.bodyText}>{mi.client_personality.decision_making}</p>
              <List items={mi.client_personality.key_motivators} label="Key motivators" />
            </Section>
          )}
        </div>

        <div style={s.col}>
          {/* Objections */}
          <Section title="Objections handled">
            {co?.objections_handled?.map((o, i) => (
              <div key={i} style={s.objCard}>
                <p style={s.objQ}>"{o.client_objection}"</p>
                <div style={s.objScore}>
                  <span style={{ ...s.scorePill, ...scorePillColor(o.effectiveness_score_out_of_10) }}>
                    {o.effectiveness_score_out_of_10}/10
                  </span>
                </div>
                <p style={s.objCritique}>{o.coaching_critique}</p>
                <div style={s.scriptBox}>
                  <p style={s.scriptLabel}>Better response</p>
                  <p style={s.scriptText}>"{o.exact_alternative_script}"</p>
                </div>
              </div>
            ))}
          </Section>

          {/* Missed revenue cues */}
          {co?.missed_revenue_cues?.length > 0 && (
            <Section title="Missed revenue cues">
              {co.missed_revenue_cues.map((c, i) => (
                <div key={i} style={s.cueCard}>
                  <p style={s.cueContext}>{c.timestamp_or_context}</p>
                  <p style={s.cueSignal}>Signal: {c.client_buying_signal}</p>
                  <p style={s.cueMissed}>Missed: {c.agent_missed_action}</p>
                </div>
              ))}
            </Section>
          )}

          {/* Top 3 action items */}
          <Section title="Top 3 coaching actions">
            {co?.top_three_action_items?.map((item, i) => (
              <div key={i} style={s.topAction}>
                <span style={s.topNum}>{i + 1}</span>
                <span style={s.actionText}>{item}</span>
              </div>
            ))}
          </Section>

          {/* Intelligence insights */}
          <Section title="Intelligence insights">
            <List items={mi?.intelligence_insights} />
          </Section>
        </div>
      </div>

      {/* Transcript */}
      {meeting.transcript && (
        <Section title="Transcript">
          <pre style={s.transcript}>{meeting.transcript}</pre>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }) {
  if (!children || (Array.isArray(children) && children.every(c => !c))) return null
  return (
    <div style={ss.section}>
      <h4 style={ss.sectionTitle}>{title}</h4>
      {children}
    </div>
  )
}

function List({ items, label }) {
  if (!items?.length) return null
  return (
    <div>
      {label && <p style={ss.metaLabel}>{label}</p>}
      {items.map((item, i) => (
        <p key={i} style={ss.listItem}>· {item}</p>
      ))}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div style={ss.metric}>
      <span style={ss.metricValue}>{value}</span>
      <span style={ss.metricLabel}>{label}</span>
    </div>
  )
}

const s = {
  wrap:          { maxWidth: '1000px', margin: '0 auto', padding: '2.5rem 1.5rem', background: '#FFFFFF', minHeight: '100vh', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  back:          { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#8A8779', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0, fontFamily: 'inherit' },
  meetingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' },
  title:         { color: '#0A1A2F', margin: '0 0 6px', fontSize: '22px', fontWeight: 600, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  date:          { color: '#8A8779', margin: 0, fontSize: '14px' },
  dealBadge:     { fontSize: '12px', fontWeight: 700, padding: '6px 16px', borderRadius: '20px', letterSpacing: '0.05em' },
  summaryBox:    { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' },
  summaryText:   { color: '#46443E', fontSize: '15px', margin: 0, lineHeight: 1.7 },
  gradeRow:      { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '10px', padding: '1.25rem' },
  gradeBox:      { display: 'flex', alignItems: 'baseline', gap: '4px', flexShrink: 0 },
  gradeNum:      { color: '#0A1A2F', fontSize: '52px', fontWeight: 700, lineHeight: 1, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  gradeLabel:    { color: '#8A8779', fontSize: '18px' },
  gradeHeadline: { color: '#46443E', fontSize: '15px', margin: 0, lineHeight: 1.5 },
  metricsRow:    { display: 'flex', gap: '12px', marginBottom: '2rem', flexWrap: 'wrap' },
  cols:          { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '2rem' },
  col:           { display: 'flex', flexDirection: 'column', gap: '0' },
  bodyText:      { color: '#46443E', fontSize: '14px', margin: '0 0 10px', lineHeight: 1.6 },
  metaLabel:     { color: '#8A8779', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' },
  actionItem:    { display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' },
  ownerBadge:    { background: '#EAF0F5', color: '#2C5478', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 },
  actionText:    { color: '#46443E', fontSize: '14px', lineHeight: 1.5 },
  deadline:      { color: '#8A8779', fontSize: '12px', marginLeft: 'auto' },
  objCard:       { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '8px', padding: '1rem', marginBottom: '10px' },
  objQ:          { color: '#0A1A2F', fontSize: '14px', margin: '0 0 8px', fontStyle: 'italic' },
  objScore:      { marginBottom: '8px' },
  scorePill:     { fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' },
  objCritique:   { color: '#8A8779', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.6 },
  scriptBox:     { background: '#F1F5F1', border: '1px solid #D9E4DA', borderRadius: '6px', padding: '10px' },
  scriptLabel:   { color: '#3F6249', fontSize: '11px', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  scriptText:    { color: '#3F6249', fontSize: '13px', margin: 0, lineHeight: 1.6 },
  cueCard:       { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '8px', padding: '1rem', marginBottom: '10px' },
  cueContext:    { color: '#8A8779', fontSize: '12px', margin: '0 0 6px' },
  cueSignal:     { color: '#8F6423', fontSize: '13px', margin: '0 0 4px' },
  cueMissed:     { color: '#B3453B', fontSize: '13px', margin: 0 },
  topAction:     { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' },
  topNum:        { color: '#8F6423', fontWeight: 700, fontSize: '18px', lineHeight: 1, flexShrink: 0, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  err:           { color: '#B3453B', fontSize: '14px' },
  transcript:    { color: '#8A8779', fontSize: '13px', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: "'IBM Plex Mono', monospace", margin: 0 },
}

const ss = {
  section:      { marginBottom: '1.5rem' },
  sectionTitle: { color: '#8A8779', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px', paddingBottom: '8px', borderBottom: '1px solid #E5E2DB', fontFamily: "'IBM Plex Mono', monospace" },
  listItem:     { color: '#46443E', fontSize: '14px', margin: '0 0 6px', lineHeight: 1.5 },
  metaLabel:    { color: '#8A8779', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' },
  metric:       { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '8px', padding: '12px 20px', textAlign: 'center', flex: 1, minWidth: '80px' },
  metricValue:  { display: 'block', color: '#0A1A2F', fontSize: '22px', fontWeight: 600, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  metricLabel:  { display: 'block', color: '#8A8779', fontSize: '12px', marginTop: '4px' },
}
