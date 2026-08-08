import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Mic, Upload, ArrowLeft, ArrowRight, Radio } from 'lucide-react'
import { api } from '../api'
import { useLiveTranscription } from '../hooks/useLiveTranscription'

const EASE = [0.22, 0.61, 0.36, 1]

export default function Meeting({ token }) {
  const reduce = useReducedMotion()
  // Was useSearchParams() from react-router-dom — TanStack's equivalent
  // needs search-param schema validation set up at the route level.
  // Reading it directly off the URL avoids forcing that setup for a
  // single optional ?id= param.
  const existingId = useMemo(() => new URLSearchParams(window.location.search).get('id'), [])

  const [meeting, setMeeting] = useState(null)
  const [mode, setMode]       = useState('idle')
  const [status, setStatus]   = useState('')

  const [meetingId, setMeetingId]   = useState(null)
  const [finalizing, setFinalizing] = useState(false)

  const [file, setFile]           = useState(null)
  const [uploading, setUploading] = useState(false)

  const meetingIdRef = useRef(null)
  const pollRef       = useRef(null)
  const hasStartedLiveRef = useRef(false)

  const navigate = useNavigate()

  const {
    start: startLiveAudio,
    stop: stopLiveAudio,
    status: liveStatus,
    segments,
    nudges,
    error: liveError,
  } = useLiveTranscription({ token, meetingId })

  useEffect(() => {
    if (existingId) api.getResults(token, existingId).then(setMeeting)
  }, [existingId])

  useEffect(() => () => {
    clearInterval(pollRef.current)
    stopLiveAudio()
  }, [])

  useEffect(() => {
    if (mode === 'live' && meetingId && !hasStartedLiveRef.current) {
      hasStartedLiveRef.current = true
      startLiveAudio()
    }
  }, [mode, meetingId])

  useEffect(() => {
    if (liveStatus === 'connecting') setStatus('Connecting to live transcription...')
    if (liveStatus === 'live')       setStatus('Recording live...')
    if (liveStatus === 'error') {
      setStatus(
        liveError === 'SESSION_EXPIRED'
          ? 'Your session expired. Please log out and log back in to start a live recording.'
          : `Live transcription error: ${liveError}`
      )
    }
  }, [liveStatus, liveError])

  const startLive = async () => {
    setStatus('Provisioning new meeting on server...')
    hasStartedLiveRef.current = false
    try {
      const { meeting_id } = await api.startMeeting(token)
      meetingIdRef.current = meeting_id
      setMeetingId(meeting_id)
      setMode('live')
      setFinalizing(false)
    } catch (err) {
      if (err.status === 402) {
        navigate({ to: '/pricing' })
        return
      }
      setStatus(`Initialization error: ${err.message}`)
      setMode('idle')
    }
  }

  const stopLive = () => {
    stopLiveAudio()
    setFinalizing(true)
    setStatus('Finalizing transcript, running analysis engine...')
    startPolling(meetingIdRef.current)
  }

  const startPolling = (meeting_id) => {
    pollRef.current = setInterval(async () => {
      try {
        const result = await api.getResults(token, meeting_id)
        if (result.status === 'done') {
          clearInterval(pollRef.current)
          setMeeting(result)
          setMode('done')
          setStatus('')
        } else if (result.status === 'failed') {
          clearInterval(pollRef.current)
          setStatus('Backend workers encountered a tracking error.')
        }
      } catch (_) {}
    }, 10000)
  }

  const runUpload = async () => {
    if (!file) return
    setUploading(true)
    setStatus('Uploading file...')
    try {
      const { meeting_id } = await api.startMeeting(token)
      meetingIdRef.current = meeting_id

      const filename = file.name
      const { upload_url, s3_key } = await api.getUploadUrl(token, meeting_id, filename)

      const s3Resp = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'audio/mpeg' }
      })
      if (!s3Resp.ok) throw new Error(`S3 upload failed: ${s3Resp.status}`)

      setStatus('Transcribing and analyzing...')
      await api.uploadComplete(token, meeting_id, s3_key)
      startPolling(meeting_id)
    } catch (err) {
      if (err.status === 402) {
        navigate({ to: '/pricing' })
        return
      }
      setStatus(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  const dealColor = (score) =>
    score === 'hot'  ? '#B3453B' :
    score === 'warm' ? '#8F6423' : '#2C5478'

  const dealBg = (score) =>
    score === 'hot'  ? '#F7E9E7' :
    score === 'warm' ? '#F6ECD9' : '#EAF0F5'

  // ── Results view ──────────────────────────────────────────────────────────
  if (meeting?.status === 'done') {
    const mi = meeting.insights?.meeting_intelligence
    const co = meeting.insights?.coaching
    return (
      <div className="osf-mtg">
        <style>{MEETING_STYLES}</style>
        <div className="osf-mtg-wrap">
          <button className="osf-mtg-back" onClick={() => navigate({ to: '/' })}>
            <ArrowLeft size={13} /> Dashboard
          </button>

          <motion.div className="osf-mtg-section" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            <h2 className="osf-mtg-title">Meeting intelligence</h2>
            <p className="osf-mtg-summary">{mi?.summary}</p>
            <div className="osf-mtg-row">
              <div className="osf-mtg-badge" style={{ background: dealBg(mi?.deal_health?.score), color: dealColor(mi?.deal_health?.score) }}>
                {mi?.deal_health?.score?.toUpperCase()}
              </div>
              <p className="osf-mtg-reasoning">{mi?.deal_health?.reasoning}</p>
            </div>
            <Grid label="Buying signals"  items={mi?.buying_signals} />
            <Grid label="Pain points"     items={mi?.client_pain_points} />
            <Grid label="Next steps"      items={mi?.deal_health?.next_steps} />
            <Grid label="Action items"    items={mi?.action_items?.map(a => `[${a.owner}] ${a.task}`)} />
          </motion.div>

          {co && (
            <motion.div className="osf-mtg-section" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease: EASE }}>
              <h2 className="osf-mtg-title">Coaching report</h2>
              <div className="osf-mtg-score-row">
                <span className="osf-mtg-score">{co.overall_grade?.score_out_of_100}</span>
                <span className="osf-mtg-score-label">/100 · {co.overall_grade?.headline_summary}</span>
              </div>
              <div className="osf-mtg-metrics">
                <Metric label="Agent talk"  value={`${co.metrics?.agent_talk_ratio_percentage}%`} />
                <Metric label="Client talk" value={`${co.metrics?.client_talk_ratio_percentage}%`} />
                <Metric label="Open Qs"     value={co.metrics?.open_ended_questions_count} />
                <Metric label="Closed Qs"   value={co.metrics?.closed_questions_count} />
              </div>
              {co.objections_handled?.map((o, i) => (
                <motion.div key={i} className="osf-mtg-obj-card"
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.06, ease: EASE }}>
                  <p className="osf-mtg-obj-q">"{o.client_objection}"</p>
                  <p className="osf-mtg-obj-meta">Effectiveness: {o.effectiveness_score_out_of_10}/10</p>
                  <p className="osf-mtg-obj-critique">{o.coaching_critique}</p>
                  <p className="osf-mtg-obj-script">
                    <ArrowRight size={13} style={{ flexShrink: 0, marginTop: '3px', marginRight: '5px' }} />
                    "{o.exact_alternative_script}"
                  </p>
                </motion.div>
              ))}
              <Grid label="Top 3 action items" items={co.top_three_action_items} />
            </motion.div>
          )}
        </div>
      </div>
    )
  }

  // ── Recording / upload view ───────────────────────────────────────────────
  return (
    <div className="osf-mtg">
      <style>{MEETING_STYLES}</style>
      <div className="osf-mtg-aurora" aria-hidden="true">
        <motion.div className="osf-mtg-blob a"
          animate={reduce ? undefined : { x: [0, 26, -10, 0], y: [0, -18, 14, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="osf-mtg-blob b"
          animate={reduce ? undefined : { x: [0, -22, 16, 0], y: [0, 16, -12, 0] }}
          transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <div className="osf-mtg-wrap">
        <button className="osf-mtg-back" onClick={() => navigate({ to: '/' })}>
          <ArrowLeft size={13} /> Dashboard
        </button>
        <h2 className="osf-mtg-title">New meeting</h2>

        {mode === 'idle' && (
          <motion.div className="osf-mtg-mode-row" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
            <button className="osf-mtg-mode-card" onClick={startLive}>
              <span className="osf-mtg-mode-icon"><Mic size={20} /></span>
              <span className="osf-mtg-mode-label">Live recording</span>
              <span className="osf-mtg-mode-sub">Captions appear as you speak · live speaker labels</span>
            </button>
            <button className="osf-mtg-mode-card" onClick={() => setMode('upload')}>
              <span className="osf-mtg-mode-icon"><Upload size={20} /></span>
              <span className="osf-mtg-mode-label">Upload file</span>
              <span className="osf-mtg-mode-sub">Upload an existing recording</span>
            </button>
          </motion.div>
        )}

        {mode === 'live' && !finalizing && (
          <motion.div className="osf-mtg-live-box" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, ease: EASE }}>
            <div className="osf-mtg-rec-dot-wrap">
              <span className="osf-mtg-rec-dot" style={{
                background: liveStatus === 'live' ? '#E0645A' : '#D8D4C9',
                animation: liveStatus === 'live' ? 'osfMtgPulse 1.6s ease-in-out infinite' : 'none',
              }} />
              {liveStatus === 'live' && <Radio size={13} className="osf-mtg-rec-icon" />}
            </div>
            <p className="osf-mtg-rec-label">
              {liveStatus === 'connecting' && 'Connecting...'}
              {liveStatus === 'live'       && 'Recording live'}
              {liveStatus === 'error'      && status}
            </p>

            {nudges.length > 0 && (
              <div className="osf-mtg-nudge-stack">
                <AnimatePresence>
                  {nudges.map(n => {
                    const nStyle = nudgeStyleFor(n.category)
                    return (
                      <motion.div key={n.id} className="osf-mtg-nudge-card"
                        style={{ borderColor: nStyle.border, background: nStyle.background }}
                        initial={{ opacity: 0, x: -14, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ duration: 0.4, ease: EASE }}>
                        <span className="osf-mtg-nudge-label" style={{ color: nStyle.label }}>{nudgeLabelFor(n.category)}</span>
                        <p className="osf-mtg-nudge-text">{n.text}</p>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}

            <div className="osf-mtg-captions-box">
              {segments.length === 0 && (
                <p className="osf-mtg-caption-placeholder">Start talking, your words will appear here in real time.</p>
              )}
              {segments.map((seg, i) => (
                <p key={i} className="osf-mtg-caption-line" style={{ opacity: seg.isFinal ? 1 : 0.55 }}>
                  <span className="osf-mtg-caption-speaker">Speaker {seg.speaker}:</span> {seg.text}
                </p>
              ))}
            </div>

            <button className="osf-mtg-btn-stop" onClick={stopLive} disabled={liveStatus !== 'live'}>
              Stop & analyze
            </button>
          </motion.div>
        )}

        {mode === 'live' && finalizing && (
          <div className="osf-mtg-finalizing-box">
            <div className="osf-mtg-skel-group">
              <div className="osf-mtg-skel" style={{ width: '55%' }} />
              <div className="osf-mtg-skel" style={{ width: '85%' }} />
              <div className="osf-mtg-skel" style={{ width: '70%' }} />
            </div>
            <p className="osf-mtg-status">{status}</p>
          </div>
        )}

        {mode === 'upload' && !uploading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }}>
            <label className="osf-mtg-dropzone">
              <input type="file" accept=".ogg,.mp3,.wav,.m4a,.mp4,.webm"
                onChange={e => setFile(e.target.files[0])} style={{ display: 'none' }} />
              <span className="osf-mtg-dropzone-icon"><Upload size={20} /></span>
              <span className="osf-mtg-dropzone-text">{file ? file.name : 'Click to choose a recording'}</span>
            </label>
            <button className="osf-mtg-btn-primary" onClick={runUpload} disabled={!file}>
              Analyze meeting
            </button>
          </motion.div>
        )}

        {uploading && (
          <div className="osf-mtg-skel-group">
            <div className="osf-mtg-skel" style={{ width: '60%' }} />
            <div className="osf-mtg-skel" style={{ width: '40%' }} />
          </div>
        )}

        {status && mode !== 'live' && !uploading && <p className="osf-mtg-status">{status}</p>}
      </div>
    </div>
  )
}

function nudgeLabelFor(category) {
  return {
    objection:     'Objection raised',
    buying_signal: 'Buying signal',
    talk_ratio:    'Talk ratio',
    discovery_gap: 'Discovery gap',
    closing:       'Closing opportunity',
  }[category] || 'Coaching tip'
}

function nudgeStyleFor(category) {
  if (category === 'objection')     return { border: '#E3B9B3', background: '#F7E9E7', label: '#B3453B' }
  if (category === 'buying_signal') return { border: '#C9DDC9', background: '#F1F5F1', label: '#3F6249' }
  return { border: '#C7D6E3', background: '#EAF0F5', label: '#2C5478' }
}

function Grid({ label, items }) {
  if (!items?.length) return null
  return (
    <div className="osf-mtg-grid-block">
      <p className="osf-mtg-grid-label">{label}</p>
      {items.map((item, i) => <p key={i} className="osf-mtg-grid-item">· {item}</p>)}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div className="osf-mtg-metric">
      <span className="osf-mtg-metric-value">{value}</span>
      <span className="osf-mtg-metric-label">{label}</span>
    </div>
  )
}

const MEETING_STYLES = `
  .osf-mtg{
    --navy-950:#08172A; --navy-900:#0A1A2F; --navy-700:#1B3A5C;
    --bg:#FCFBF9; --line:#E5E2DB; --line-strong:#D8D4C9;
    --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
    --accent:#C79541; --accent-soft:#F6ECD9; --accent-strong:#8F6423; --teal:#2F9C8E; --danger:#B3453B;
    --ease:cubic-bezier(.22,.61,.36,1);
    background:var(--bg); min-height:100vh; position:relative; overflow:hidden;
    font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--text-body);
  }
  .osf-mtg *{box-sizing:border-box;}
  .osf-mtg-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;}
  .osf-mtg-blob{position:absolute;border-radius:50%;filter:blur(100px);opacity:.35;}
  .osf-mtg-blob.a{width:480px;height:480px;top:-200px;right:-160px;
    background:radial-gradient(circle,rgba(199,149,65,.4),transparent 70%);}
  .osf-mtg-blob.b{width:420px;height:420px;bottom:-180px;left:-140px;
    background:radial-gradient(circle,rgba(47,156,142,.28),transparent 70%);}
  .osf-mtg-wrap{position:relative;z-index:1;max-width:860px;margin:0 auto;padding:2.5rem 1.5rem 4rem;}
  .osf-mtg-back{display:inline-flex;align-items:center;gap:5px;background:none;border:none;
    color:var(--text-muted);cursor:pointer;font-size:14px;margin-bottom:1.5rem;padding:0;
    font-family:inherit;transition:color .2s var(--ease);}
  .osf-mtg-back:hover{color:var(--navy-900);}
  .osf-mtg-title{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
    margin:0 0 1.5rem;font-size:24px;font-weight:700;letter-spacing:-.02em;}

  .osf-mtg-section{margin-bottom:3rem;}
  .osf-mtg-summary{color:var(--text-body);font-size:15px;line-height:1.7;margin:0 0 1.5rem;}
  .osf-mtg-row{display:flex;align-items:flex-start;gap:12px;margin-bottom:1.5rem;flex-wrap:wrap;}
  .osf-mtg-badge{font-size:11px;font-weight:700;padding:5px 13px;border-radius:20px;letter-spacing:.05em;white-space:nowrap;}
  .osf-mtg-reasoning{color:var(--text-muted);font-size:14px;margin:0;line-height:1.6;}
  .osf-mtg-grid-block{margin-bottom:1.5rem;}
  .osf-mtg-grid-label{color:var(--text-muted);font-size:11.5px;font-weight:700;text-transform:uppercase;
    letter-spacing:.08em;margin:0 0 8px;font-family:'IBM Plex Mono',monospace;}
  .osf-mtg-grid-item{color:var(--text-body);font-size:14px;margin:0 0 6px;line-height:1.5;}

  .osf-mtg-score-row{display:flex;align-items:baseline;gap:10px;margin-bottom:1.5rem;}
  .osf-mtg-score{font-family:'Space Grotesk','Inter',sans-serif;
    background:linear-gradient(100deg,var(--navy-950),var(--accent-strong));
    -webkit-background-clip:text;background-clip:text;color:transparent;
    font-size:52px;font-weight:700;line-height:1;letter-spacing:-.03em;}
  .osf-mtg-score-label{color:var(--text-muted);font-size:15px;}
  .osf-mtg-metrics{display:flex;gap:14px;margin-bottom:2rem;flex-wrap:wrap;}
  .osf-mtg-metric{background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:12px;
    padding:14px 22px;text-align:center;transition:transform .3s var(--ease),box-shadow .3s var(--ease);}
  .osf-mtg-metric:hover{transform:translateY(-3px);box-shadow:0 16px 30px -22px rgba(10,26,47,.4);}
  .osf-mtg-metric-value{display:block;color:var(--navy-950);font-size:23px;font-weight:600;
    font-family:'Space Grotesk','Inter',sans-serif;}
  .osf-mtg-metric-label{display:block;color:var(--text-muted);font-size:12px;margin-top:4px;}

  .osf-mtg-obj-card{background:rgba(255,255,255,.8);border:1px solid var(--line);border-radius:14px;
    padding:1.4rem;margin-bottom:12px;transition:border-color .3s var(--ease),transform .3s var(--ease);}
  .osf-mtg-obj-card:hover{border-color:rgba(199,149,65,.4);transform:translateY(-2px);}
  .osf-mtg-obj-q{color:var(--navy-950);font-size:14.5px;margin:0 0 8px;font-style:italic;}
  .osf-mtg-obj-meta{color:var(--text-muted);font-size:12px;margin:0 0 8px;}
  .osf-mtg-obj-critique{color:var(--text-body);font-size:14px;margin:0 0 10px;line-height:1.6;}
  .osf-mtg-obj-script{color:var(--accent-strong);font-size:14px;margin:0;line-height:1.6;display:flex;align-items:flex-start;}

  .osf-mtg-mode-row{display:flex;gap:16px;flex-wrap:wrap;}
  .osf-mtg-mode-card{flex:1;min-width:220px;position:relative;overflow:hidden;
    background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(245,243,238,.6));
    border:1px solid var(--line);border-radius:16px;padding:2rem 1.6rem;cursor:pointer;
    display:flex;flex-direction:column;gap:8px;text-align:left;color:inherit;font-family:inherit;
    transition:transform .35s var(--ease),box-shadow .35s var(--ease),border-color .35s var(--ease);}
  .osf-mtg-mode-card:hover{transform:translateY(-5px);border-color:rgba(199,149,65,.5);
    box-shadow:0 26px 50px -30px rgba(10,26,47,.5);}
  .osf-mtg-mode-icon{width:40px;height:40px;border-radius:11px;
    background:linear-gradient(135deg,var(--accent-soft),#FBF3E3);color:var(--accent-strong);
    display:flex;align-items:center;justify-content:center;margin-bottom:4px;
    transition:transform .4s var(--ease);}
  .osf-mtg-mode-card:hover .osf-mtg-mode-icon{transform:translateY(-3px) rotate(-6deg) scale(1.08);}
  .osf-mtg-mode-label{color:var(--navy-950);font-size:16px;font-weight:600;}
  .osf-mtg-mode-sub{color:var(--text-muted);font-size:13px;line-height:1.5;}

  .osf-mtg-live-box{background:rgba(255,255,255,.85);backdrop-filter:blur(10px);
    border:1px solid var(--line);border-radius:18px;padding:2.5rem;text-align:center;
    box-shadow:0 30px 60px -40px rgba(10,26,47,.4);}
  .osf-mtg-rec-dot-wrap{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:1.25rem;}
  .osf-mtg-rec-dot{width:14px;height:14px;border-radius:50%;}
  @keyframes osfMtgPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(224,100,90,.5);}50%{opacity:.4;box-shadow:0 0 0 8px rgba(224,100,90,0);}}
  .osf-mtg-rec-icon{color:var(--danger);}
  .osf-mtg-rec-label{color:var(--navy-950);font-size:18px;font-weight:600;margin:0 0 1.5rem;
    font-family:'Space Grotesk','Inter',sans-serif;}
  .osf-mtg-captions-box{background:rgba(255,255,255,.9);border:1px solid var(--line);border-radius:12px;
    padding:1.25rem;margin-bottom:1.5rem;max-height:320px;overflow-y:auto;text-align:left;}
  .osf-mtg-nudge-stack{display:flex;flex-direction:column;gap:10px;margin-bottom:1.5rem;text-align:left;}
  .osf-mtg-nudge-card{border:1px solid;border-radius:12px;padding:.95rem 1.15rem;
    box-shadow:0 12px 24px -18px rgba(10,26,47,.3);}
  .osf-mtg-nudge-label{display:block;font-size:11px;font-weight:700;letter-spacing:.05em;
    text-transform:uppercase;margin-bottom:4px;}
  .osf-mtg-nudge-text{color:var(--text);font-size:14px;line-height:1.5;margin:0;font-weight:500;}
  .osf-mtg-caption-placeholder{color:var(--text-muted);font-size:13px;font-style:italic;margin:0;}
  .osf-mtg-caption-line{color:var(--text-body);font-size:14px;line-height:1.7;margin:0 0 8px;}
  .osf-mtg-caption-speaker{color:var(--navy-700);font-weight:600;}

  .osf-mtg-btn-stop{position:relative;overflow:hidden;padding:12px 30px;border-radius:10px;border:none;
    background:linear-gradient(135deg,#C8564A,var(--danger));color:#fff;font-weight:600;cursor:pointer;
    font-size:14px;font-family:inherit;box-shadow:0 16px 30px -16px rgba(179,69,59,.6);
    transition:transform .25s var(--ease),box-shadow .25s var(--ease),opacity .2s var(--ease);}
  .osf-mtg-btn-stop:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 22px 40px -16px rgba(179,69,59,.7);}
  .osf-mtg-btn-stop:disabled{opacity:.55;cursor:default;}

  .osf-mtg-finalizing-box{background:rgba(255,255,255,.85);border:1px solid var(--line);border-radius:18px;
    padding:2.5rem;text-align:center;}
  .osf-mtg-skel-group{display:flex;flex-direction:column;gap:10px;align-items:center;margin-bottom:1rem;}
  .osf-mtg-skel{height:11px;border-radius:5px;
    background:linear-gradient(90deg,var(--accent-soft) 25%,#FBF4E6 37%,var(--accent-soft) 63%);
    background-size:400% 100%;animation:osfMtgShimmer 1.6s ease-in-out infinite;}
  @keyframes osfMtgShimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}

  .osf-mtg-dropzone{display:flex;flex-direction:column;align-items:center;gap:10px;
    padding:2.5rem 1.5rem;border:1.5px dashed var(--line-strong);border-radius:16px;cursor:pointer;
    margin-bottom:1rem;background:rgba(245,243,238,.6);
    transition:border-color .3s var(--ease),background .3s var(--ease),transform .3s var(--ease);}
  .osf-mtg-dropzone:hover{border-color:var(--accent);background:var(--accent-soft);transform:translateY(-2px);}
  .osf-mtg-dropzone-icon{width:42px;height:42px;border-radius:12px;background:#fff;
    border:1px solid var(--line);color:var(--navy-700);display:flex;align-items:center;justify-content:center;}
  .osf-mtg-dropzone-text{color:var(--text-muted);font-size:13.5px;text-align:center;}

  .osf-mtg-btn-primary{position:relative;overflow:hidden;width:100%;padding:12.5px;border-radius:10px;
    border:none;background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;
    font-weight:600;cursor:pointer;font-size:14.5px;font-family:inherit;
    box-shadow:0 16px 30px -18px rgba(10,26,47,.8);
    transition:transform .25s var(--ease),box-shadow .25s var(--ease),opacity .2s var(--ease);}
  .osf-mtg-btn-primary::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
    transform:translateX(-140%) skewX(-18deg);}
  .osf-mtg-btn-primary:hover:not(:disabled)::after{transition:transform .8s var(--ease);transform:translateX(300%) skewX(-18deg);}
  .osf-mtg-btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 22px 40px -18px rgba(10,26,47,.75);}
  .osf-mtg-btn-primary:disabled{opacity:.55;cursor:default;}

  .osf-mtg-status{color:var(--navy-700);font-size:13px;margin:1rem 0;}
  @media (prefers-reduced-motion:reduce){ .osf-mtg-skel{animation:none;} .osf-mtg-blob{display:none;} }
`
