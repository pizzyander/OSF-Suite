import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'

const CHUNK_DURATION_MS = 30000 // 30 seconds

export default function Meeting({ token }) {
  const [params]              = useSearchParams()
  const existingId            = params.get('id')
  const [meeting, setMeeting] = useState(null)
  const [mode, setMode]       = useState('idle') // idle | live | upload | done
  const [status, setStatus]   = useState('')
  const [chunkCount, setChunkCount] = useState(0)
  const [file, setFile]       = useState(null)
  const [uploading, setUploading] = useState(false)

  const meetingIdRef    = useRef(null)
  const mediaRecRef     = useRef(null)
  const streamRef       = useRef(null)
  const pollRef         = useRef(null)
  const chunkIndexRef   = useRef(0)

  const navigate = useNavigate()

  // View existing meeting
  useEffect(() => {
    if (existingId) {
      api.getResults(token, existingId).then(setMeeting)
    }
  }, [existingId])

  // Cleanup on unmount
  useEffect(() => () => {
    clearInterval(pollRef.current)
    stopStream()
  }, [])

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  // ── Upload a single blob chunk to S3 then notify API ──────────────────────
  const uploadChunk = async (blob, meetingId) => {
    const index    = chunkIndexRef.current++
    const filename = `chunk_${String(index).padStart(4, '0')}.webm`

    try {
      const { upload_url, s3_key } = await api.getUploadUrl(token, meetingId, filename)

      await fetch(upload_url, {
        method: 'PUT',
        body: blob,
        headers: { 'Content-Type': 'audio/webm' }
      })

      await api.uploadChunk(token, meetingId, s3_key)
      setChunkCount(c => c + 1)
      console.log(`Chunk ${index} uploaded (${(blob.size / 1024).toFixed(1)} KB)`)
    } catch (err) {
      console.error(`Chunk ${index} failed:`, err)
    }
  }

  // ── Start live recording ───────────────────────────────────────────────────
  const startLive = async () => {
    setStatus('Requesting microphone...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      setStatus('Starting meeting...')
      const { meeting_id } = await api.startMeeting(token)
      meetingIdRef.current = meeting_id

      setMode('live')
      setStatus('Recording...')
      chunkIndexRef.current = 0

      const startChunk = () => {
        const rec   = new MediaRecorder(stream, { mimeType: 'audio/webm' })
        const blobs = []
        mediaRecRef.current = rec

        rec.ondataavailable = e => { if (e.data.size > 0) blobs.push(e.data) }
        rec.onstop = () => {
          const blob = new Blob(blobs, { type: 'audio/webm' })
          if (blob.size > 0) uploadChunk(blob, meeting_id)
        }

        rec.start()
        setTimeout(() => {
          if (rec.state === 'recording') rec.stop()
        }, CHUNK_DURATION_MS)
      }

      // Start first chunk immediately, then roll every 30s
      startChunk()
      const interval = setInterval(() => {
        if (streamRef.current) startChunk()
        else clearInterval(interval)
      }, CHUNK_DURATION_MS)

    } catch (err) {
      setStatus(`Error: ${err.message}`)
      setMode('idle')
    }
  }

  // ── Stop live recording and trigger analysis ───────────────────────────────
  const stopLive = async () => {
    setStatus('Stopping recording...')

    // Stop the current chunk recorder so its data is flushed
    if (mediaRecRef.current?.state === 'recording') {
      mediaRecRef.current.stop()
    }

    // Give the last chunk upload a moment to fire
    await new Promise(r => setTimeout(r, 1500))

    stopStream()

    setStatus('Ending meeting — triggering analysis...')
    await api.endMeeting(token, meetingIdRef.current)

    setMode('upload') // reuse upload mode for polling UI
    setStatus('Analyzing... (takes a few minutes on CPU)')
    startPolling(meetingIdRef.current)
  }

  // ── Manual file upload flow ────────────────────────────────────────────────
  const runUpload = async () => {
    if (!file) return
    setUploading(true)
    setStatus('Starting meeting...')
    try {
      const { meeting_id } = await api.startMeeting(token)
      meetingIdRef.current = meeting_id

      setStatus('Getting upload URL...')
      const { upload_url, s3_key } = await api.getUploadUrl(token, meeting_id, file.name)

      setStatus('Uploading to S3...')
      const s3Resp = await fetch(upload_url, { method: 'PUT', body: file })
      if (!s3Resp.ok) throw new Error(`S3 upload failed: ${s3Resp.status}`)

      setStatus('Sending for transcription...')
      await api.uploadChunk(token, meeting_id, s3_key)

      setStatus('Ending meeting — triggering analysis...')
      await api.endMeeting(token, meeting_id)

      setStatus('Analyzing... (takes a few minutes on CPU)')
      startPolling(meeting_id)
    } catch (err) {
      setStatus(`Error: ${err.message}`)
      setUploading(false)
    }
  }

  // ── Poll for results ───────────────────────────────────────────────────────
  const startPolling = (meeting_id) => {
    pollRef.current = setInterval(async () => {
      try {
        const result = await api.getResults(token, meeting_id)
        if (result.status === 'done') {
          clearInterval(pollRef.current)
          setMeeting(result)
          setMode('done')
          setStatus('')
          setUploading(false)
        } else if (result.status === 'failed') {
          clearInterval(pollRef.current)
          setStatus('Analysis failed. Check worker logs.')
          setUploading(false)
        }
      } catch (_) {}
    }, 15000)
  }

  // ── Render: results view ───────────────────────────────────────────────────
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

  // ── Render: recording / processing view ───────────────────────────────────
  return (
    <div style={styles.wrap}>
      <button style={styles.back} onClick={() => navigate('/')}>← Dashboard</button>
      <h2 style={styles.title}>New Meeting</h2>

      {/* Mode selector */}
      {mode === 'idle' && (
        <div style={styles.modeRow}>
          <div style={styles.modeCard} onClick={startLive}>
            <span style={styles.modeIcon}>🎙</span>
            <span style={styles.modeLabel}>Live recording</span>
            <span style={styles.modeSub}>Record now — chunks upload every 30s</span>
          </div>
          <div style={styles.modeCard} onClick={() => setMode('upload')}>
            <span style={styles.modeIcon}>📁</span>
            <span style={styles.modeLabel}>Upload file</span>
            <span style={styles.modeSub}>Upload an existing recording</span>
          </div>
        </div>
      )}

      {/* Live recording UI */}
      {mode === 'live' && (
        <div style={styles.liveBox}>
          <div style={styles.recDot} />
          <p style={styles.recLabel}>Recording in progress</p>
          <p style={styles.recSub}>{chunkCount} chunk{chunkCount !== 1 ? 's' : ''} uploaded so far</p>
          <p style={styles.recSub}>A new chunk uploads every 30 seconds automatically</p>
          <button style={styles.btnStop} onClick={stopLive}>
            Stop & Analyze
          </button>
        </div>
      )}

      {/* File upload UI */}
      {mode === 'upload' && !uploading && !status.includes('Analyzing') && (
        <>
          <input type="file" accept=".ogg,.mp3,.wav,.m4a,.mp4,.webm"
            onChange={e => setFile(e.target.files[0])} style={styles.fileInput} />
          {file && <p style={styles.filename}>{file.name}</p>}
          <button style={styles.btn} onClick={runUpload} disabled={!file}>
            Analyze meeting
          </button>
        </>
      )}

      {/* Status / polling */}
      {status && <p style={styles.status}>{status}</p>}
    </div>
  )
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
  recDot:      { width: '14px', height: '14px', borderRadius: '50%', background: '#ff6b6b', margin: '0 auto 1rem', animation: 'pulse 1.5s ease-in-out infinite' },
  recLabel:    { color: '#fff', fontSize: '18px', fontWeight: 600, margin: '0 0 8px' },
  recSub:      { color: '#555', fontSize: '13px', margin: '0 0 6px' },
  btnStop:     { marginTop: '1.5rem', padding: '11px 28px', borderRadius: '8px', background: '#ff6b6b', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  fileInput:   { color: '#aaa', fontSize: '14px', marginBottom: '8px' },
  filename:    { color: '#666', fontSize: '13px', margin: '0 0 1rem' },
  status:      { color: '#ffd93d', fontSize: '13px', margin: '1rem 0' },
  btn:         { padding: '11px 24px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
}