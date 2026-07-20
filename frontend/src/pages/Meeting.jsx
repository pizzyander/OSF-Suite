import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useLiveTranscription } from '../hooks/useLiveTranscription' // adjust path to wherever you saved the hook

export default function Meeting({ token }) {
  const [params]              = useSearchParams()
  const existingId            = params.get('id')
  const [meeting, setMeeting] = useState(null)
  const [mode, setMode]       = useState('idle') // idle | live | upload | done
  const [status, setStatus]   = useState('')

  // Live-recording specific state
  const [meetingId, setMeetingId]   = useState(null)   // must be React state (not just a ref) so
                                                          // useLiveTranscription re-renders with the
                                                          // correct id once the meeting is created
  const [finalizing, setFinalizing] = useState(false)   // true once recording stopped, waiting on analysis

  // Manual file-upload specific state
  const [file, setFile]           = useState(null)
  const [uploading, setUploading] = useState(false)

  const meetingIdRef = useRef(null) // convenience ref for use inside callbacks/polling without stale closures
  const pollRef       = useRef(null)
  const hasStartedLiveRef = useRef(false) // guards against double-starting the mic in React StrictMode dev

  const navigate = useNavigate()

  // The hook re-renders its `start`/`stop` functions whenever `meetingId`
  // changes — so we can't call start() in the same tick we set meetingId,
  // we have to wait for the re-render (handled by the effect below).
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

  // Once the meeting has been created server-side (meetingId is set) and
  // we're in live mode, actually open the mic + WebSocket. This has to be
  // an effect (not called directly in startLive) because startLiveAudio's
  // closure only picks up the fresh meetingId after React re-renders.
  useEffect(() => {
    if (mode === 'live' && meetingId && !hasStartedLiveRef.current) {
      hasStartedLiveRef.current = true
      startLiveAudio()
    }
  }, [mode, meetingId])

  // Reflect the hook's connection status into our own status message.
  // SESSION_EXPIRED is a specific signal from the backend (a rejected
  // WebSocket handshake, close code 4401) meaning the access token died
  // sometime between page load and clicking "Live recording" — distinct
  // from a generic network/connection failure, so the user knows exactly
  // what to do about it instead of just "something went wrong."
  useEffect(() => {
    if (liveStatus === 'connecting') setStatus('Connecting to live transcription...')
    if (liveStatus === 'live')       setStatus('Recording live...')
    if (liveStatus === 'error') {
      setStatus(
        liveError === 'SESSION_EXPIRED'
          ? 'Your session expired — please log out and log back in to start a live recording.'
          : `Live transcription error: ${liveError}`
      )
    }
  }, [liveStatus, liveError])

  // ── Live recording lifecycle ────────────────────────────────────────────
  const startLive = async () => {
    setStatus('Provisioning new meeting on server...')
    hasStartedLiveRef.current = false
    try {
      const { meeting_id } = await api.startMeeting(token)
      meetingIdRef.current = meeting_id
      setMeetingId(meeting_id) // triggers the effect above once React re-renders
      setMode('live')
      setFinalizing(false)
    } catch (err) {
      setStatus(`Initialization error: ${err.message}`)
      setMode('idle')
    }
  }

  const stopLive = () => {
    // Closing the WebSocket (after sending {"type": "end"}, handled inside
    // the hook) is the signal our backend uses to know the meeting has
    // ended deliberately — it assembles the final transcript from
    // everything Deepgram sent during the session and queues analysis
    // itself. The frontend doesn't need to declare a chunk count anymore.
    stopLiveAudio()
    setFinalizing(true)
    setStatus('Finalizing transcript — running analysis engine...')
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

  // ── Manual file-upload lifecycle (unchanged) ─────────────────────────────
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
      setStatus(`Upload failed: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  // ── Results view ──────────────────────────────────────────────────────────
  if (meeting?.status === 'done') {
    const mi = meeting.insights?.meeting_intelligence
    const co = meeting.insights?.coaching
    return (
      <div style={styles.wrap}>
        <button style={styles.back} onClick={() => navigate('/')}>← Dashboard</button>
        <div style={styles.section}>
          <h2 style={styles.title}>Meeting Intelligence</h2>
          <p style={styles.summary}>{mi?.summary}</p>
          <div style={styles.row}>
            <div style={{
              ...styles.badge,
              background: mi?.deal_health?.score === 'hot' ? '#2d1a1a' : mi?.deal_health?.score === 'warm' ? '#2a2210' : '#1a1a2d',
              color:      mi?.deal_health?.score === 'hot' ? '#ff6b6b' : mi?.deal_health?.score === 'warm' ? '#ffd93d' : '#6c8fff'
            }}>
              {mi?.deal_health?.score?.toUpperCase()}
            </div>
            <p style={styles.reasoning}>{mi?.deal_health?.reasoning}</p>
          </div>
          <Grid label="Buying signals"  items={mi?.buying_signals} />
          <Grid label="Pain points"     items={mi?.client_pain_points} />
          <Grid label="Next steps"      items={mi?.deal_health?.next_steps} />
          <Grid label="Action items"    items={mi?.action_items?.map(a => `[${a.owner}] ${a.task}`)} />
        </div>
        {co && (
          <div style={styles.section}>
            <h2 style={styles.title}>Coaching Report</h2>
            <div style={styles.scoreRow}>
              <span style={styles.score}>{co.overall_grade?.score_out_of_100}</span>
              <span style={styles.scoreLabel}>/100 — {co.overall_grade?.headline_summary}</span>
            </div>
            <div style={styles.metrics}>
              <Metric label="Agent talk"  value={`${co.metrics?.agent_talk_ratio_percentage}%`} />
              <Metric label="Client talk" value={`${co.metrics?.client_talk_ratio_percentage}%`} />
              <Metric label="Open Qs"     value={co.metrics?.open_ended_questions_count} />
              <Metric label="Closed Qs"   value={co.metrics?.closed_questions_count} />
            </div>
            {co.objections_handled?.map((o, i) => (
              <div key={i} style={styles.objCard}>
                <p style={styles.objQ}>"{o.client_objection}"</p>
                <p style={styles.objMeta}>Effectiveness: {o.effectiveness_score_out_of_10}/10</p>
                <p style={styles.objCritique}>{o.coaching_critique}</p>
                <p style={styles.objScript}>→ "{o.exact_alternative_script}"</p>
              </div>
            ))}
            <Grid label="Top 3 action items" items={co.top_three_action_items} />
          </div>
        )}
      </div>
    )
  }

  // ── Recording / upload view ───────────────────────────────────────────────
  return (
    <div style={styles.wrap}>
      <button style={styles.back} onClick={() => navigate('/')}>← Dashboard</button>
      <h2 style={styles.title}>New Meeting</h2>

      {mode === 'idle' && (
        <div style={styles.modeRow}>
          <div style={styles.modeCard} onClick={startLive}>
            <span style={styles.modeIcon}>🎙</span>
            <span style={styles.modeLabel}>Live recording</span>
            <span style={styles.modeSub}>Captions appear as you speak · live speaker labels</span>
          </div>
          <div style={styles.modeCard} onClick={() => setMode('upload')}>
            <span style={styles.modeIcon}>📁</span>
            <span style={styles.modeLabel}>Upload file</span>
            <span style={styles.modeSub}>Upload an existing recording</span>
          </div>
        </div>
      )}

      {mode === 'live' && !finalizing && (
        <div style={styles.liveBox}>
          <div style={{
            ...styles.recDot,
            background: liveStatus === 'live' ? '#ff6b6b' : '#555',
            animation: liveStatus === 'live' ? 'pulse 1.5s ease-in-out infinite' : 'none'
          }} />
          <p style={styles.recLabel}>
            {liveStatus === 'connecting' && 'Connecting...'}
            {liveStatus === 'live'       && 'Recording live'}
            {liveStatus === 'error'      && status}
          </p>

          {/* Live coaching nudges — objections, buying signals, and periodic
              call-health checks (talk ratio, discovery gaps, closing).
              Rendered above the transcript since these are the thing a
              rep needs to notice INSTANTLY, mid-conversation. */}
          {nudges.length > 0 && (
            <div style={styles.nudgeStack}>
              {nudges.map(n => (
                <div key={n.id} style={{ ...styles.nudgeCard, ...nudgeStyleFor(n.category) }}>
                  <span style={styles.nudgeLabel}>{nudgeLabelFor(n.category)}</span>
                  <p style={styles.nudgeText}>{n.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Live captions — auto-scrolling transcript as Deepgram sends it back */}
          <div style={styles.captionsBox}>
            {segments.length === 0 && (
              <p style={styles.captionPlaceholder}>Start talking — your words will appear here in real time.</p>
            )}
            {segments.map((seg, i) => (
              <p key={i} style={{ ...styles.captionLine, opacity: seg.isFinal ? 1 : 0.55 }}>
                <span style={styles.captionSpeaker}>Speaker {seg.speaker}:</span> {seg.text}
              </p>
            ))}
          </div>

          <button style={styles.btnStop} onClick={stopLive} disabled={liveStatus !== 'live'}>
            Stop & Analyze
          </button>
        </div>
      )}

      {mode === 'live' && finalizing && (
        <p style={styles.status}>{status}</p>
      )}

      {mode === 'upload' && !uploading && (
        <>
          <input type="file" accept=".ogg,.mp3,.wav,.m4a,.mp4,.webm"
            onChange={e => setFile(e.target.files[0])} style={styles.fileInput} />
          {file && <p style={styles.filename}>{file.name}</p>}
          <button style={styles.btn} onClick={runUpload} disabled={!file}>
            Analyze meeting
          </button>
        </>
      )}

      {status && mode !== 'live' && <p style={styles.status}>{status}</p>}
    </div>
  )
}

// Maps each nudge category to a short human label and a distinct color —
// objections (needs attention, red-orange) read differently at a glance
// from buying signals (good news, green) or call-health checks (neutral,
// blue), so a rep can react to the right one on instinct without reading
// closely mid-conversation.
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
  if (category === 'objection')     return { borderColor: '#ff6b6b', background: '#2d1a1a' }
  if (category === 'buying_signal') return { borderColor: '#6bffb8', background: '#0f2418' }
  return { borderColor: '#6c8fff', background: '#1a1a2d' } // talk_ratio, discovery_gap, closing, fallback
}

function Grid({ label, items }) {
  if (!items?.length) return null
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <p style={styles.gridLabel}>{label}</p>
      {items.map((item, i) => <p key={i} style={styles.gridItem}>· {item}</p>)}
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div style={styles.metric}>
      <span style={styles.metricValue}>{value}</span>
      <span style={styles.metricLabel}>{label}</span>
    </div>
  )
}

const styles = {
  wrap:        { maxWidth: '860px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  back:        { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0 },
  title:       { color: '#fff', margin: '0 0 1.5rem', fontSize: '22px', fontWeight: 600 },
  section:     { marginBottom: '3rem' },
  summary:     { color: '#ccc', fontSize: '15px', lineHeight: 1.7, margin: '0 0 1.5rem' },
  row:         { display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap' },
  badge:       { fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', letterSpacing: '0.05em', whiteSpace: 'nowrap' },
  reasoning:   { color: '#888', fontSize: '14px', margin: 0, lineHeight: 1.6 },
  gridLabel:   { color: '#aaa', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' },
  gridItem:    { color: '#ccc', fontSize: '14px', margin: '0 0 6px', lineHeight: 1.5 },
  scoreRow:    { display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '1.5rem' },
  score:       { color: '#6c5ce7', fontSize: '48px', fontWeight: 700, lineHeight: 1 },
  scoreLabel:  { color: '#aaa', fontSize: '15px' },
  metrics:     { display: 'flex', gap: '16px', marginBottom: '2rem', flexWrap: 'wrap' },
  metric:      { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '8px', padding: '12px 20px', textAlign: 'center' },
  metricValue: { display: 'block', color: '#fff', fontSize: '22px', fontWeight: 600 },
  metricLabel: { display: 'block', color: '#555', fontSize: '12px', marginTop: '4px' },
  objCard:     { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', marginBottom: '12px' },
  objQ:        { color: '#fff', fontSize: '14px', margin: '0 0 8px', fontStyle: 'italic' },
  objMeta:     { color: '#666', fontSize: '12px', margin: '0 0 8px' },
  objCritique: { color: '#aaa', fontSize: '14px', margin: '0 0 10px', lineHeight: 1.6 },
  objScript:   { color: '#6bffb8', fontSize: '14px', margin: 0, lineHeight: 1.6 },
  modeRow:     { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  modeCard:    { flex: 1, minWidth: '200px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '2rem 1.5rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '8px' },
  modeIcon:    { fontSize: '28px' },
  modeLabel:   { color: '#fff', fontSize: '16px', fontWeight: 600 },
  modeSub:     { color: '#555', fontSize: '13px', lineHeight: 1.5 },
  liveBox:     { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '2.5rem', textAlign: 'center' },
  recDot:      { width: '14px', height: '14px', borderRadius: '50%', margin: '0 auto 1.5rem' },
  recLabel:    { color: '#fff', fontSize: '18px', fontWeight: 600, margin: '0 0 1.5rem' },
  captionsBox: { background: '#111', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem', maxHeight: '320px', overflowY: 'auto', textAlign: 'left' },
  nudgeStack:  { display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem', textAlign: 'left' },
  nudgeCard:   { border: '1px solid', borderRadius: '10px', padding: '0.9rem 1.1rem', animation: 'fadeIn 0.3s ease' },
  nudgeLabel:  { display: 'block', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.75, marginBottom: '4px', color: '#fff' },
  nudgeText:   { color: '#fff', fontSize: '14px', lineHeight: 1.5, margin: 0, fontWeight: 500 },
  captionPlaceholder: { color: '#444', fontSize: '13px', fontStyle: 'italic', margin: 0 },
  captionLine: { color: '#ddd', fontSize: '14px', lineHeight: 1.7, margin: '0 0 8px' },
  captionSpeaker: { color: '#6c5ce7', fontWeight: 600 },
  btnStop:     { padding: '11px 28px', borderRadius: '8px', background: '#ff6b6b', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  fileInput:   { color: '#aaa', fontSize: '14px', marginBottom: '8px' },
  filename:    { color: '#666', fontSize: '13px', margin: '0 0 1rem' },
  status:      { color: '#ffd93d', fontSize: '13px', margin: '1rem 0' },
  btn:         { padding: '11px 24px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
}
