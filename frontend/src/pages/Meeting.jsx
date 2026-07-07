import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'

const CHUNK_DURATION_MS = 30000

export default function Meeting({ token }) {
  const [params]              = useSearchParams()
  const existingId            = params.get('id')
  const [meeting, setMeeting] = useState(null)
  const [mode, setMode]       = useState('idle')
  const [status, setStatus]   = useState('')
  const [chunkCount, setChunkCount]       = useState(0)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [file, setFile]       = useState(null)
  const [uploading, setUploading] = useState(false)

  const meetingIdRef    = useRef(null)
  const mediaRecRef     = useRef(null)
  const streamRef       = useRef(null)
  const pollRef         = useRef(null)
  const intervalRef     = useRef(null)
  const chunkIndexRef   = useRef(0)

  // Local queue state
  const queueRef        = useRef([])   // { blob, index }
  const uploadingRef    = useRef(false)
  const endedRef        = useRef(false)
  const totalChunksRef  = useRef(0)

  const navigate = useNavigate()

  useEffect(() => {
    if (existingId) api.getResults(token, existingId).then(setMeeting)
  }, [existingId])

  useEffect(() => () => {
    clearInterval(pollRef.current)
    clearInterval(intervalRef.current)
    stopStream()
  }, [])

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  // ── Local queue processor — uploads one chunk at a time ───────────────────
  const processQueue = async (meetingId) => {
    if (uploadingRef.current) return
    if (queueRef.current.length === 0) {
      if (endedRef.current && chunkIndexRef.current >= totalChunksRef.current) {
        triggerAnalysis(meetingId)
      }
      return
    }

    uploadingRef.current = true
    const { blob, index } = queueRef.current.shift()

    try {
      const filename = `chunk_${String(index).padStart(4, '0')}.webm`
      const { upload_url, s3_key } = await api.getUploadUrl(token, meetingId, filename)

      const s3Resp = await fetch(upload_url, {
        method:  'PUT',
        body:    blob,
        headers: { 'Content-Type': 'audio/webm' }
      })

      console.log(`S3 PUT status: ${s3Resp.status} | blob size: ${blob.size} bytes`)

      if (!s3Resp.ok) {
        throw new Error(`S3 upload failed: ${s3Resp.status} ${s3Resp.statusText}`)
      }

      await api.uploadChunk(token, meetingId, s3_key)
      setUploadedCount(c => c + 1)
      console.log(`Chunk ${index} uploaded and queued (${(blob.size/1024).toFixed(1)} KB)`)
    } catch (err) {
      console.error(`Chunk ${index} failed — requeueing:`, err)
      queueRef.current.unshift({ blob, index })
      await new Promise(r => setTimeout(r, 2000))
    } finally {
      uploadingRef.current = false
      processQueue(meetingId)
    }
  }

  const triggerAnalysis = async (meetingId) => {
    console.log('All chunks uploaded — triggering analysis')
    setStatus('Ending meeting — triggering analysis...')
    try {
      await api.endMeeting(token, meetingId, totalChunksRef.current)
      setStatus('Analyzing... (takes a few minutes on CPU)')
      startPolling(meetingId)
    } catch (err) {
      setStatus(`Error ending meeting: ${err.message}`)
    }
  }

  // ── Enqueue and track new chunks ──────────────────────────────────────────
  const enqueueChunk = (blob, meetingId) => {
    const currentIndex = chunkIndexRef.current
    chunkIndexRef.current += 1

    setChunkCount(prev => prev + 1)
    queueRef.current.push({ blob, index: currentIndex })

    processQueue(meetingId)
  }

  // ── Start live recording ──────────────────────────────────────────────────
  const startLive = async () => {
    setStatus('Requesting microphone...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      setStatus('Starting meeting...')
      const { meeting_id } = await api.startMeeting(token)
      meetingIdRef.current  = meeting_id
      chunkIndexRef.current = 0
      queueRef.current      = []
      uploadingRef.current  = false
      endedRef.current      = false
      totalChunksRef.current = 0

      setMode('live')
      setStatus('Recording...')
      setChunkCount(0)
      setUploadedCount(0)

      // Check if browser supports opus
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const startChunk = () => {
        const rec   = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
        const blobs = []
        mediaRecRef.current = rec

        rec.ondataavailable = e => { if (e.data.size > 0) blobs.push(e.data) }
        rec.onstop = () => {
          const blob = new Blob(blobs, { type: mimeType })
          if (blob.size > 0) enqueueChunk(blob, meeting_id)
        }

        rec.start()
        setTimeout(() => {
          if (rec.state === 'recording') rec.stop()
        }, CHUNK_DURATION_MS)
      }

      startChunk()
      intervalRef.current = setInterval(() => {
        if (streamRef.current) startChunk()
        else clearInterval(intervalRef.current)
      }, CHUNK_DURATION_MS)

    } catch (err) {
      setStatus(`Error: ${err.message}`)
      setMode('idle')
    }
  }

  // ── Stop live recording ───────────────────────────────────────────────────
  const stopLive = () => {
    clearInterval(intervalRef.current)

    // Stop current recorder — onstop will enqueue the last partial chunk
    if (mediaRecRef.current?.state === 'recording') {
      mediaRecRef.current.stop()
    }

    stopStream()
    setMode('upload') // show polling UI
    setStatus('Flushing last chunk...')

    // Total chunks = whatever chunkIndexRef becomes after onstop fires
    // We poll until the queue drains, then triggerAnalysis fires automatically
    endedRef.current = true

    // Give onstop 500ms to fire and enqueue the last chunk
    setTimeout(() => {
      totalChunksRef.current = chunkIndexRef.current
      console.log(`Meeting ended — total chunks: ${totalChunksRef.current}`)
      setStatus(`Uploading remaining chunks (${queueRef.current.length} left)...`)

      // If queue already empty (all chunks uploaded before stop), trigger now
      if (queueRef.current.length === 0 && !uploadingRef.current) {
        triggerAnalysis(meetingIdRef.current)
      }
    }, 500)
  }

  // ── Manual file upload ────────────────────────────────────────────────────
  const runUpload = async () => {
    if (!file) return
    setUploading(true)
    setStatus('Starting meeting...')
    try {
      const { meeting_id } = await api.startMeeting(token)
      meetingIdRef.current  = meeting_id

      setStatus('Getting upload URL...')
      const { upload_url, s3_key } = await api.getUploadUrl(token, meeting_id, file.name)

      setStatus('Uploading to S3...')
      const s3Resp = await fetch(upload_url, { method: 'PUT', body: file })
      if (!s3Resp.ok) throw new Error(`S3 upload failed: ${s3Resp.status}`)

      setStatus('Sending for transcription...')
      await api.uploadChunk(token, meeting_id, s3_key)

      setStatus('Ending meeting...')
      await api.endMeeting(token, meeting_id, 1)

      setStatus('Analyzing... (takes a few minutes on CPU)')
      startPolling(meeting_id)
    } catch (err) {
      setStatus(`Error: ${err.message}`)
      setUploading(false)
    }
  }

  // ── Poll for results ──────────────────────────────────────────────────────
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
            <span style={styles.modeSub}>Record now · opus compressed · chunks upload every 30s</span>
          </div>
          <div style={styles.modeCard} onClick={() => setMode('upload')}>
            <span style={styles.modeIcon}>📁</span>
            <span style={styles.modeLabel}>Upload file</span>
            <span style={styles.modeSub}>Upload an existing recording</span>
          </div>
        </div>
      )}

      {mode === 'live' && (
        <div style={styles.liveBox}>
          <div style={styles.recDot} />
          <p style={styles.recLabel}>Recording in progress</p>
          <div style={styles.chunkStats}>
            <div style={styles.statBox}>
              <span style={styles.statNum}>{chunkCount}</span>
              <span style={styles.statLabel}>recorded</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.statBox}>
              <span style={styles.statNum}>{uploadedCount}</span>
              <span style={styles.statLabel}>uploaded</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.statBox}>
              <span style={styles.statNum}>{queueRef.current.length}</span>
              <span style={styles.statLabel}>queued</span>
            </div>
          </div>
          <p style={styles.recSub}>Opus compressed · uploading sequentially · 32kbps</p>
          <button style={styles.btnStop} onClick={stopLive}>
            Stop & Analyze
          </button>
        </div>
      )}

      {mode === 'upload' && !status.includes('Analyzing') && !uploading && (
        <>
          <input type="file" accept=".ogg,.mp3,.wav,.m4a,.mp4,.webm"
            onChange={e => setFile(e.target.files[0])} style={styles.fileInput} />
          {file && <p style={styles.filename}>{file.name}</p>}
          <button style={styles.btn} onClick={runUpload} disabled={!file}>
            Analyze meeting
          </button>
        </>
      )}

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
  recDot:      { width: '14px', height: '14px', borderRadius: '50%', background: '#ff6b6b', margin: '0 auto 1.5rem', animation: 'pulse 1.5s ease-in-out infinite' },
  recLabel:    { color: '#fff', fontSize: '18px', fontWeight: 600, margin: '0 0 1.5rem' },
  chunkStats:  { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0', marginBottom: '1rem', background: '#111', borderRadius: '10px', padding: '1rem', border: '1px solid #2a2a2a' },
  statBox:     { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' },
  statNum:     { color: '#fff', fontSize: '28px', fontWeight: 700 },
  statLabel:   { color: '#555', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em' },
  statDivider: { width: '1px', height: '40px', background: '#2a2a2a', margin: '0 8px' },
  recSub:      { color: '#555', fontSize: '12px', margin: '0 0 1.5rem' },
  btnStop:     { padding: '11px 28px', borderRadius: '8px', background: '#ff6b6b', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  fileInput:   { color: '#aaa', fontSize: '14px', marginBottom: '8px' },
  filename:    { color: '#666', fontSize: '13px', margin: '0 0 1rem' },
  status:      { color: '#ffd93d', fontSize: '13px', margin: '1rem 0' },
  btn:         { padding: '11px 24px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
}