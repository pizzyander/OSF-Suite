import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

  if (loading) return <div style={s.wrap}><p style={s.muted}>Loading...</p></div>
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
    background: score === 'hot'  ? '#2d1a1a' :
                score === 'warm' ? '#2a2210' : '#1a1a2d',
    color:      score === 'hot'  ? '#ff6b6b' :
                score === 'warm' ? '#ffd93d' : '#6c8fff',
  })

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate('/')}>← All meetings</button>

      {/* Meeting header */}
      <div style={s.meetingHeader}>
        <div>
          <h2 style={s.title}>Meeting Report</h2>
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
                  <span style={{
                    ...s.scorePill,
                    background: o.effectiveness_score_out_of_10 >= 7 ? '#0a2a1a' : o.effectiveness_score_out_of_10 >= 4 ? '#2a2210' : '#2d1a1a',
                    color:      o.effectiveness_score_out_of_10 >= 7 ? '#6bffb8' : o.effectiveness_score_out_of_10 >= 4 ? '#ffd93d' : '#ff6b6b',
                  }}>
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
  wrap:          { maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  back:          { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0 },
  meetingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' },
  title:         { color: '#fff', margin: '0 0 6px', fontSize: '22px', fontWeight: 600 },
  date:          { color: '#555', margin: 0, fontSize: '14px' },
  dealBadge:     { fontSize: '12px', fontWeight: 700, padding: '6px 16px', borderRadius: '20px', letterSpacing: '0.05em' },
  summaryBox:    { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' },
  summaryText:   { color: '#ccc', fontSize: '15px', margin: 0, lineHeight: 1.7 },
  gradeRow:      { display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem' },
  gradeBox:      { display: 'flex', alignItems: 'baseline', gap: '4px', flexShrink: 0 },
  gradeNum:      { color: '#6c5ce7', fontSize: '52px', fontWeight: 700, lineHeight: 1 },
  gradeLabel:    { color: '#555', fontSize: '18px' },
  gradeHeadline: { color: '#aaa', fontSize: '15px', margin: 0, lineHeight: 1.5 },
  metricsRow:    { display: 'flex', gap: '12px', marginBottom: '2rem', flexWrap: 'wrap' },
  cols:          { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '2rem' },
  col:           { display: 'flex', flexDirection: 'column', gap: '0' },
  bodyText:      { color: '#bbb', fontSize: '14px', margin: '0 0 10px', lineHeight: 1.6 },
  metaLabel:     { color: '#555', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' },
  actionItem:    { display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' },
  ownerBadge:    { background: '#1e1a3a', color: '#6c5ce7', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 },
  actionText:    { color: '#bbb', fontSize: '14px', lineHeight: 1.5 },
  deadline:      { color: '#555', fontSize: '12px', marginLeft: 'auto' },
  objCard:       { background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '1rem', marginBottom: '10px' },
  objQ:          { color: '#fff', fontSize: '14px', margin: '0 0 8px', fontStyle: 'italic' },
  objScore:      { marginBottom: '8px' },
  scorePill:     { fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' },
  objCritique:   { color: '#888', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.6 },
  scriptBox:     { background: '#0a1a0a', border: '1px solid #1a3a1a', borderRadius: '6px', padding: '10px' },
  scriptLabel:   { color: '#3a7a3a', fontSize: '11px', fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  scriptText:    { color: '#6bffb8', fontSize: '13px', margin: 0, lineHeight: 1.6 },
  cueCard:       { background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '1rem', marginBottom: '10px' },
  cueContext:    { color: '#666', fontSize: '12px', margin: '0 0 6px' },
  cueSignal:     { color: '#ffd93d', fontSize: '13px', margin: '0 0 4px' },
  cueMissed:     { color: '#ff6b6b', fontSize: '13px', margin: 0 },
  topAction:     { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' },
  topNum:        { color: '#6c5ce7', fontWeight: 700, fontSize: '18px', lineHeight: 1, flexShrink: 0 },
  muted:         { color: '#555', fontSize: '14px' },
  err:           { color: '#ff6b6b', fontSize: '14px' },
  transcript:    { color: '#555', fontSize: '13px', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 },
}

const ss = {
  section:      { marginBottom: '1.5rem' },
  sectionTitle: { color: '#aaa', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px', paddingBottom: '8px', borderBottom: '1px solid #1a1a1a' },
  listItem:     { color: '#bbb', fontSize: '14px', margin: '0 0 6px', lineHeight: 1.5 },
  metaLabel:    { color: '#555', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' },
  metric:       { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '12px 20px', textAlign: 'center', flex: 1, minWidth: '80px' },
  metricValue:  { display: 'block', color: '#fff', fontSize: '22px', fontWeight: 600 },
  metricLabel:  { display: 'block', color: '#555', fontSize: '12px', marginTop: '4px' },
}