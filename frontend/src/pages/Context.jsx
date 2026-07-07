import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Context({ token }) {
  const [context, setContext]   = useState(null)
  const [text, setText]         = useState('')
  const [file, setFile]         = useState(null)
  const [status, setStatus]     = useState('')
  const [loading, setLoading]   = useState(false)
  const [tab, setTab]           = useState('text') // 'text' | 'file'
  const navigate = useNavigate()

  useEffect(() => {
    api.getContext(token)
      .then(setContext)
      .catch(() => setContext(null))
  }, [])

  const saveText = async () => {
    if (!text.trim()) return
    setLoading(true)
    setStatus('')
    try {
      await api.uploadContextText(token, text)
      setStatus('Saved and active.')
      const updated = await api.getContext(token)
      setContext(updated)
      setText('')
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const saveFile = async () => {
    if (!file) return
    setLoading(true)
    setStatus('')
    try {
      await api.uploadContextFile(token, file)
      setStatus('File uploaded and active.')
      const updated = await api.getContext(token)
      setContext(updated)
      setFile(null)
    } catch (err) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const remove = async () => {
    await api.deleteContext(token)
    setContext(null)
    setStatus('Context cleared.')
  }

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate('/')}>← Back</button>
      <h2 style={s.title}>Company Context</h2>
      <p style={s.sub}>
        This is necessary so the AI can evaluates your performance
        against your own pricing, policies, and scripts.
      </p>

      {/* Active context */}
      {context && (
        <div style={s.card}>
          <div style={s.cardTop}>
            <span style={s.activeLabel}>Active context</span>
            <button style={s.btnDanger} onClick={remove}>Clear</button>
          </div>
          <p style={s.meta}>
            {context.source_type} · {context.character_count} chars ·{' '}
            {new Date(context.created_at).toLocaleString()}
          </p>
          <pre style={s.preview}>
            {context.extracted_text?.slice(0, 600)}
            {context.extracted_text?.length > 600 ? '\n...' : ''}
          </pre>
        </div>
      )}

      {/* Upload tabs */}
      <div style={s.tabs}>
        <button
          style={{ ...s.tab, ...(tab === 'text' ? s.tabActive : {}) }}
          onClick={() => setTab('text')}
        >
          Paste text
        </button>
        <button
          style={{ ...s.tab, ...(tab === 'file' ? s.tabActive : {}) }}
          onClick={() => setTab('file')}
        >
          Upload file
        </button>
      </div>

      {/* Text tab */}
      {tab === 'text' && (
        <div>
          <textarea
            style={s.textarea}
            rows={10}
            placeholder="Paste your company info, pricing tiers, scripts, policies..."
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <button style={s.btn} onClick={saveText} disabled={loading || !text.trim()}>
            {loading ? 'Saving...' : 'Save context'}
          </button>
        </div>
      )}

      {/* File tab */}
      {tab === 'file' && (
        <div style={s.fileArea}>
          <p style={s.fileLabel}>

            Upload a file about your company: company info, pricing tiers, scripts, policies...
            Accepted formats: PDF, DOCX, TXT
            
            </p>
          <input
            type="file"
            accept=".pdf,.docx,.txt,.text"
            onChange={e => setFile(e.target.files[0])}
            style={s.fileInput}
          />
          {file && (
            <p style={s.fileName}>
              {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
          <button style={s.btn} onClick={saveFile} disabled={loading || !file}>
            {loading ? 'Uploading...' : 'Upload file'}
          </button>
        </div>
      )}

      {status && (
        <p style={{
          ...s.statusMsg,
          color: status.startsWith('Error') ? '#ff6b6b' : '#6bffb8'
        }}>
          {status}
        </p>
      )}
    </div>
  )
}

const s = {
  wrap:        { maxWidth: '760px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  back:        { background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0 },
  title:       { color: '#fff', margin: '0 0 8px', fontSize: '22px', fontWeight: 600 },
  sub:         { color: '#555', fontSize: '14px', margin: '0 0 2rem', lineHeight: 1.6 },
  card:        { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', marginBottom: '2rem' },
  cardTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  activeLabel: { color: '#6bffb8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' },
  meta:        { color: '#444', fontSize: '12px', margin: '0 0 12px' },
  preview:     { color: '#888', fontSize: '12px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6, fontFamily: 'monospace' },
  tabs:        { display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid #2a2a2a' },
  tab:         { background: 'none', border: 'none', color: '#555', fontSize: '14px', cursor: 'pointer', padding: '10px 20px', borderBottom: '2px solid transparent', marginBottom: '-1px' },
  tabActive:   { color: '#fff', borderBottomColor: '#6c5ce7' },
  textarea:    { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#111', color: '#fff', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', display: 'block', marginBottom: '12px' },
  fileArea:    { display: 'flex', flexDirection: 'column', gap: '12px' },
  fileLabel:   { color: '#555', fontSize: '13px', margin: 0 },
  fileInput:   { color: '#aaa', fontSize: '14px' },
  fileName:    { color: '#6bffb8', fontSize: '13px', margin: 0 },
  btn:         { padding: '10px 20px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  btnDanger:   { padding: '6px 12px', borderRadius: '6px', background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b33', cursor: 'pointer', fontSize: '12px' },
  statusMsg:   { fontSize: '13px', marginTop: '12px' },
}