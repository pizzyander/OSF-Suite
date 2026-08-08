import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowLeft } from 'lucide-react'
import { api } from '../api'

const EASE = [0.22, 0.61, 0.36, 1]

// CHANGED: id now comes in as a prop from the route file
// (routes/meeting.$id.jsx already extracts it via Route.useParams()),
// rather than this component calling useParams() itself — avoids a
// duplicate/second source of truth for the same param.
export default function MeetingDetail({ token, id }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
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
    <div className="osf-detail">
      <style>{DETAIL_STYLES}</style>
      <div className="osf-detail-wrap">
        <div className="osf-detail-summary-box">
          <div className="osf-detail-skel" style={{ width: '40%', height: '13px', marginBottom: '12px' }} />
          <div className="osf-detail-skel" style={{ width: '95%', height: '11px', marginBottom: '8px' }} />
          <div className="osf-detail-skel" style={{ width: '80%', height: '11px' }} />
        </div>
      </div>
    </div>
  )
  if (error) return (
    <div className="osf-detail">
      <style>{DETAIL_STYLES}</style>
      <div className="osf-detail-wrap"><p className="osf-detail-err">{error}</p></div>
    </div>
  )
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
    <div className="osf-detail">
      <style>{DETAIL_STYLES}</style>
      <div className="osf-detail-aurora" aria-hidden="true">
        <motion.div className="osf-detail-blob a"
          animate={reduce ? undefined : { x: [0, 22, -8, 0], y: [0, -14, 10, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <div className="osf-detail-wrap">
        <button className="osf-detail-back" onClick={() => navigate({ to: '/' })}>
          <ArrowLeft size={13} /> All meetings
        </button>

        <motion.div className="osf-detail-header" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
          <div>
            <h1 className="osf-detail-title">Meeting report</h1>
            <p className="osf-detail-date">{date} at {time}</p>
          </div>
          {mi?.deal_health?.score && (
            <span className="osf-detail-deal-badge" style={dealColor(mi.deal_health.score)}>
              {mi.deal_health.score.toUpperCase()}
            </span>
          )}
        </motion.div>

        {mi?.summary && (
          <motion.div className="osf-detail-summary-box" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05, ease: EASE }}>
            <p className="osf-detail-summary-text">{mi.summary}</p>
          </motion.div>
        )}

        {co?.overall_grade && (
          <motion.div className="osf-detail-grade-row" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.1, ease: EASE }}>
            <div className="osf-detail-grade-box">
              <span className="osf-detail-grade-num">{co.overall_grade.score_out_of_100}</span>
              <span className="osf-detail-grade-label">/100</span>
            </div>
            <p className="osf-detail-grade-headline">{co.overall_grade.headline_summary}</p>
          </motion.div>
        )}

        {co?.metrics && (
          <div className="osf-detail-metrics-row">
            <Metric label="Agent talk"  value={`${co.metrics.agent_talk_ratio_percentage}%`} />
            <Metric label="Client talk" value={`${co.metrics.client_talk_ratio_percentage}%`} />
            <Metric label="Open Qs"     value={co.metrics.open_ended_questions_count} />
            <Metric label="Closed Qs"   value={co.metrics.closed_questions_count} />
          </div>
        )}

        <div className="osf-detail-cols">
          <div className="osf-detail-col">
            {mi?.deal_health && (
              <Section title="Deal health">
                <p className="osf-detail-body-text">{mi.deal_health.reasoning}</p>
                <List items={mi.deal_health.next_steps} label="Next steps" />
              </Section>
            )}
            <Section title="Buying signals"><List items={mi?.buying_signals} /></Section>
            <Section title="Client pain points"><List items={mi?.client_pain_points} /></Section>
            <Section title="Action items">
              {mi?.action_items?.map((a, i) => (
                <div key={i} className="osf-detail-action-item">
                  <span className="osf-detail-owner-badge">{a.owner}</span>
                  <span className="osf-detail-action-text">{a.task}</span>
                  {a.deadline && <span className="osf-detail-deadline">{a.deadline}</span>}
                </div>
              ))}
            </Section>
            {mi?.client_personality && (
              <Section title="Client personality">
                <p className="osf-detail-meta-label">Communication style</p>
                <p className="osf-detail-body-text">{mi.client_personality.communication_style}</p>
                <p className="osf-detail-meta-label">Decision making</p>
                <p className="osf-detail-body-text">{mi.client_personality.decision_making}</p>
                <List items={mi.client_personality.key_motivators} label="Key motivators" />
              </Section>
            )}
          </div>

          <div className="osf-detail-col">
            <Section title="Objections handled">
              {co?.objections_handled?.map((o, i) => (
                <div key={i} className="osf-detail-obj-card">
                  <p className="osf-detail-obj-q">"{o.client_objection}"</p>
                  <div style={{ marginBottom: '8px' }}>
                    <span className="osf-detail-score-pill" style={scorePillColor(o.effectiveness_score_out_of_10)}>
                      {o.effectiveness_score_out_of_10}/10
                    </span>
                  </div>
                  <p className="osf-detail-obj-critique">{o.coaching_critique}</p>
                  <div className="osf-detail-script-box">
                    <p className="osf-detail-script-label">Better response</p>
                    <p className="osf-detail-script-text">"{o.exact_alternative_script}"</p>
                  </div>
                </div>
              ))}
            </Section>

            {co?.missed_revenue_cues?.length > 0 && (
              <Section title="Missed revenue cues">
                {co.missed_revenue_cues.map((c, i) => (
                  <div key={i} className="osf-detail-cue-card">
                    <p className="osf-detail-cue-context">{c.timestamp_or_context}</p>
                    <p className="osf-detail-cue-signal">Signal: {c.client_buying_signal}</p>
                    <p className="osf-detail-cue-missed">Missed: {c.agent_missed_action}</p>
                  </div>
                ))}
              </Section>
            )}

            <Section title="Top 3 coaching actions">
              {co?.top_three_action_items?.map((item, i) => (
                <div key={i} className="osf-detail-top-action">
                  <span className="osf-detail-top-num">{i + 1}</span>
                  <span className="osf-detail-action-text">{item}</span>
                </div>
              ))}
            </Section>

            <Section title="Intelligence insights"><List items={mi?.intelligence_insights} /></Section>
          </div>
        </div>

        {meeting.transcript && (
          <Section title="Transcript">
            <pre className="osf-detail-transcript">{meeting.transcript}</pre>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  if (!children || (Array.isArray(children) && children.every(c => !c))) return null
  return (
    <div className="osf-detail-section">
      <h4 className="osf-detail-section-title">{title}</h4>
      {children}
    </div>
  )
}

function List({ items, label }) {
  if (!items?.length) return null
  return (
    <div>
      {label && <p className="osf-detail-meta-label">{label}</p>}
      {items.map((item, i) => <p key={i} className="osf-detail-list-item">· {item}</p>)}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="osf-detail-metric">
      <span className="osf-detail-metric-value">{value}</span>
      <span className="osf-detail-metric-label">{label}</span>
    </div>
  )
}

const DETAIL_STYLES = `
  .osf-detail{
    --navy-950:#08172A; --navy-900:#0A1A2F; --navy-700:#1B3A5C;
    --bg:#FCFBF9; --line:#E5E2DB; --line-strong:#D8D4C9;
    --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
    --accent:#C79541; --accent-soft:#F6ECD9; --accent-strong:#8F6423; --teal:#2F9C8E; --danger:#B3453B;
    --ease:cubic-bezier(.22,.61,.36,1);
    background:var(--bg); min-height:100vh; position:relative; overflow:hidden;
    font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--text-body);
  }
  .osf-detail *{box-sizing:border-box;}
  .osf-detail-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;}
  .osf-detail-blob{position:absolute;border-radius:50%;filter:blur(110px);opacity:.3;}
  .osf-detail-blob.a{width:520px;height:520px;top:-220px;right:-180px;
    background:radial-gradient(circle,rgba(199,149,65,.4),transparent 70%);}
  .osf-detail-wrap{position:relative;z-index:1;max-width:1000px;margin:0 auto;padding:2.5rem 1.5rem 4rem;}
  .osf-detail-back{display:inline-flex;align-items:center;gap:5px;background:none;border:none;
    color:var(--text-muted);cursor:pointer;font-size:14px;margin-bottom:1.5rem;padding:0;
    font-family:inherit;transition:color .2s var(--ease);}
  .osf-detail-back:hover{color:var(--navy-900);}

  .osf-detail-header{display:flex;justify-content:space-between;align-items:flex-start;
    margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem;}
  .osf-detail-title{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
    margin:0 0 6px;font-size:24px;font-weight:700;letter-spacing:-.02em;}
  .osf-detail-date{color:var(--text-muted);margin:0;font-size:14px;}
  .osf-detail-deal-badge{font-size:12px;font-weight:700;padding:6px 16px;border-radius:20px;letter-spacing:.05em;}

  .osf-detail-summary-box, .osf-detail-grade-row{background:rgba(255,255,255,.85);backdrop-filter:blur(10px);
    border:1px solid var(--line);border-radius:14px;padding:1.4rem;margin-bottom:1.5rem;
    box-shadow:0 20px 44px -32px rgba(10,26,47,.35);}
  .osf-detail-summary-text{color:var(--text-body);font-size:15px;margin:0;line-height:1.7;}
  .osf-detail-grade-row{display:flex;align-items:center;gap:1rem;}
  .osf-detail-grade-box{display:flex;align-items:baseline;gap:4px;flex-shrink:0;}
  .osf-detail-grade-num{font-family:'Space Grotesk','Inter',sans-serif;
    background:linear-gradient(100deg,var(--navy-950),var(--accent-strong));
    -webkit-background-clip:text;background-clip:text;color:transparent;
    font-size:52px;font-weight:700;line-height:1;letter-spacing:-.03em;}
  .osf-detail-grade-label{color:var(--text-muted);font-size:18px;}
  .osf-detail-grade-headline{color:var(--text-body);font-size:15px;margin:0;line-height:1.5;}

  .osf-detail-metrics-row{display:flex;gap:12px;margin-bottom:2rem;flex-wrap:wrap;}
  .osf-detail-metric{background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:10px;
    padding:12px 20px;text-align:center;flex:1;min-width:80px;
    transition:transform .3s var(--ease),box-shadow .3s var(--ease);}
  .osf-detail-metric:hover{transform:translateY(-3px);box-shadow:0 16px 30px -22px rgba(10,26,47,.4);}
  .osf-detail-metric-value{display:block;color:var(--navy-950);font-size:22px;font-weight:600;
    font-family:'Space Grotesk','Inter',sans-serif;}
  .osf-detail-metric-label{display:block;color:var(--text-muted);font-size:12px;margin-top:4px;}

  .osf-detail-cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:2rem;}
  @media (max-width:760px){ .osf-detail-cols{grid-template-columns:1fr;} }
  .osf-detail-section{margin-bottom:1.5rem;}
  .osf-detail-section-title{color:var(--text-muted);font-size:11px;font-weight:700;text-transform:uppercase;
    letter-spacing:.08em;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid var(--line);
    font-family:'IBM Plex Mono',monospace;}
  .osf-detail-body-text{color:var(--text-body);font-size:14px;margin:0 0 10px;line-height:1.6;}
  .osf-detail-meta-label{color:var(--text-muted);font-size:11px;font-weight:600;text-transform:uppercase;
    letter-spacing:.08em;margin:0 0 6px;}
  .osf-detail-list-item{color:var(--text-body);font-size:14px;margin:0 0 6px;line-height:1.5;}

  .osf-detail-action-item{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;flex-wrap:wrap;}
  .osf-detail-owner-badge{background:#EAF0F5;color:#2C5478;font-size:11px;font-weight:600;padding:2px 8px;
    border-radius:4px;white-space:nowrap;flex-shrink:0;}
  .osf-detail-action-text{color:var(--text-body);font-size:14px;line-height:1.5;}
  .osf-detail-deadline{color:var(--text-muted);font-size:12px;margin-left:auto;}

  .osf-detail-obj-card{background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:12px;
    padding:1.1rem;margin-bottom:10px;transition:border-color .3s var(--ease),transform .3s var(--ease);}
  .osf-detail-obj-card:hover{border-color:rgba(199,149,65,.4);transform:translateY(-2px);}
  .osf-detail-obj-q{color:var(--navy-950);font-size:14px;margin:0 0 8px;font-style:italic;}
  .osf-detail-score-pill{font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;}
  .osf-detail-obj-critique{color:var(--text-muted);font-size:13px;margin:0 0 10px;line-height:1.6;}
  .osf-detail-script-box{background:rgba(47,156,142,.08);border:1px solid rgba(47,156,142,.25);
    border-radius:8px;padding:10px;}
  .osf-detail-script-label{color:var(--teal);font-size:11px;font-weight:600;margin:0 0 4px;
    text-transform:uppercase;letter-spacing:.06em;}
  .osf-detail-script-text{color:var(--teal);font-size:13px;margin:0;line-height:1.6;}

  .osf-detail-cue-card{background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:10px;
    padding:1rem;margin-bottom:10px;}
  .osf-detail-cue-context{color:var(--text-muted);font-size:12px;margin:0 0 6px;}
  .osf-detail-cue-signal{color:var(--accent-strong);font-size:13px;margin:0 0 4px;}
  .osf-detail-cue-missed{color:var(--danger);font-size:13px;margin:0;}

  .osf-detail-top-action{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;}
  .osf-detail-top-num{color:var(--accent-strong);font-weight:700;font-size:18px;line-height:1;flex-shrink:0;
    font-family:'Space Grotesk','Inter',sans-serif;}

  .osf-detail-err{color:var(--danger);font-size:14px;}
  .osf-detail-transcript{color:var(--text-muted);font-size:13px;line-height:1.8;white-space:pre-wrap;
    font-family:'IBM Plex Mono',monospace;margin:0;background:rgba(255,255,255,.6);border:1px solid var(--line);
    border-radius:12px;padding:1.25rem;}

  .osf-detail-skel{border-radius:4px;
    background:linear-gradient(90deg,var(--accent-soft) 25%,#FBF4E6 37%,var(--accent-soft) 63%);
    background-size:400% 100%;animation:osfDetailShimmer 1.6s ease-in-out infinite;}
  @keyframes osfDetailShimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}
  @media (prefers-reduced-motion:reduce){ .osf-detail-skel{animation:none;} .osf-detail-blob{display:none;} }
`
