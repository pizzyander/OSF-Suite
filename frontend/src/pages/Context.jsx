import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Context({ token }) {
  const [context, setContext] = useState(null)
  const [text, setText]       = useState('')
  const [status, setStatus]   = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.getContext(token)
      .then(setContext)
      .catch(() => setContext(null))
  }, [])

  const save = async () => {
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

  const remove = async () => {
    await api.deleteContext(token)
    setContext(null)
    setStatus('Context cleared.')
  }

  return (
    <div style={styles.wrap}>
      <button style={styles.back} onClick={() => navigate('/')}>← Back</button>
      <h2 style={styles.title}>Company Context</h2>
      <p style={styles.sub}>This is injected into every meeting analysis so the AI evaluates your agents against your own pricing, policies, and scripts.</p>

      {context && (
        <div style={styles.card}>
          <div style={styles.cardTop}>
            <span style={styles.label}>Active context</span>
            <button style={styles.btnDanger} onClick={remove}>Clear</button>
          </div>
          <p style={styles.meta}>{context.source_type} · {context.character_count} chars · {new Date(context.created_at).toLocaleString()}</p>
          <pre style={styles.preview}>{context.extracted_text?.slice(0, 500)}{context.extracted_text?.length > 500 ? '\n...' : ''}</pre>
        </div>
      )}

      <h3 style={styles.sectionTitle}>Upload new context</h3>
      <textarea style={styles.textarea} rows={10}
        placeholder="Paste your company info, pricing tiers, scripts, policies..."
        value={text} onChange={e => setText(e.target.value)} />
      {status && <p style={{ color: status.startsWith('Error') ? '#ff6b6b' : '#6bffb8', fontSize: '13px' }}>{status}</p>}
      <button style={styles.btn} onClick={save} disabled={loading || !text.trim()}>
        {loading ? 'Saving...' : 'Save context'}
      </button>
    </div>
  )
}

const styles = {
  wrap:        { maxWidth: '760px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  back:        { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0 },
  title:       { color: '#fff', margin: '0 0 8px', fontSize: '22px', fontWeight: 600 },
  sub:         { color: '#666', fontSize: '14px', margin: '0 0 2rem', lineHeight: 1.6 },
  card:        { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1.25rem', marginBottom: '2rem' },
  cardTop:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  label:       { color: '#6bffb8', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' },
  meta:        { color: '#555', fontSize: '12px', margin: '0 0 12px' },
  preview:     { color: '#aaa', fontSize: '12px', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6, fontFamily: 'monospace' },
  sectionTitle:{ color: '#aaa', fontSize: '13px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' },
  textarea:    { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#111', color: '#fff', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' },
  btn:         { marginTop: '12px', padding: '10px 20px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '14px' },
  btnDanger:   { padding: '6px 12px', borderRadius: '6px', background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b33', cursor: 'pointer', fontSize: '12px' },
}