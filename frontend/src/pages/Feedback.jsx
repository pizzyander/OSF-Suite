import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ChevronUp, MessageSquarePlus } from 'lucide-react'
import { api } from '../api'

const STATUS_LABEL = {
  under_review: 'Under review',
  planned:      'Planned',
  in_progress:  'In progress',
  done:         'Done',
  declined:     'Declined',
}
const STATUS_COLOR = {
  under_review: { bg: '#EAF0F5', color: '#2C5478' },
  planned:      { bg: '#F6ECD9', color: '#8F6423' },
  in_progress:  { bg: '#F6ECD9', color: '#8F6423' },
  done:         { bg: '#E6F0E9', color: '#3F6249' },
  declined:     { bg: '#F7E9E7', color: '#B3453B' },
}

export default function Feedback({ token }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('features') // 'features' | 'send'
  const [features, setFeatures] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [submittingFeature, setSubmittingFeature] = useState(false)

  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [feedbackCategory, setFeedbackCategory] = useState('general')
  const [sendingFeedback, setSendingFeedback] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)

  const loadFeatures = () => {
    setLoading(true)
    api.getFeatures(token)
      .then(data => setFeatures(data.features || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadFeatures() }, [token])

  const submitFeature = async (e) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    setSubmittingFeature(true)
    setError('')
    try {
      await api.submitFeature(token, newTitle.trim(), newDescription.trim() || null)
      setNewTitle('')
      setNewDescription('')
      loadFeatures()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmittingFeature(false)
    }
  }

  const toggleVote = async (featureId) => {
    // Optimistic update — flip the button and count immediately, since a
    // vote toggle should feel instant. If the request fails, loadFeatures()
    // in the catch block re-syncs to the server's real state rather than
    // leaving the UI showing something that didn't actually happen.
    setFeatures(prev => prev.map(f =>
      f.id === featureId
        ? { ...f, has_voted: !f.has_voted, vote_count: f.vote_count + (f.has_voted ? -1 : 1) }
        : f
    ))
    try {
      await api.toggleFeatureVote(token, featureId)
    } catch (err) {
      setError(err.message)
      loadFeatures()
    }
  }

  const submitFeedback = async (e) => {
    e.preventDefault()
    if (!feedbackMessage.trim()) return
    setSendingFeedback(true)
    setError('')
    try {
      await api.submitFeedback(token, feedbackMessage.trim(), feedbackCategory)
      setFeedbackMessage('')
      setFeedbackSent(true)
      setTimeout(() => setFeedbackSent(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSendingFeedback(false)
    }
  }

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate({ to: '/' })}>
        <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Dashboard
      </button>
      <h1 style={s.title}>Feedback & Features</h1>

      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(tab === 'features' ? s.tabActive : {}) }} onClick={() => setTab('features')}>
          Feature requests
        </button>
        <button style={{ ...s.tab, ...(tab === 'send' ? s.tabActive : {}) }} onClick={() => setTab('send')}>
          Send feedback
        </button>
      </div>

      {error && <p style={s.err}>{error}</p>}

      {tab === 'features' && (
        <>
          <form style={s.newFeatureCard} onSubmit={submitFeature}>
            <p style={s.newFeatureLabel}><MessageSquarePlus size={13} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Suggest a feature</p>
            <input
              style={s.input}
              placeholder="Short, specific title"
              maxLength={120}
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
            />
            <textarea
              style={s.textarea}
              rows={2}
              placeholder="Optional — what would this let you do?"
              value={newDescription}
              onChange={e => setNewDescription(e.target.value)}
            />
            <button style={{ ...s.btn, ...(submittingFeature || !newTitle.trim() ? s.btnDisabled : {}) }}
              disabled={submittingFeature || !newTitle.trim()}>
              {submittingFeature ? 'Submitting...' : 'Submit'}
            </button>
          </form>

          {loading && [0, 1, 2].map(i => (
            <div key={i} style={s.featureRow}>
              <div className="osf-fb-skel" style={{ width: '36px', height: '36px', borderRadius: '8px' }} />
              <div style={{ flex: 1 }}>
                <div className="osf-fb-skel" style={{ width: '160px', height: '11px', marginBottom: '8px' }} />
                <div className="osf-fb-skel" style={{ width: '220px', height: '9px' }} />
              </div>
            </div>
          ))}

          {!loading && features.length === 0 && (
            <p style={s.muted}>No feature requests yet — be the first to suggest one.</p>
          )}

          {!loading && features.map(f => {
            const sc = STATUS_COLOR[f.status] || STATUS_COLOR.under_review
            return (
              <div key={f.id} style={s.featureRow}>
                <button
                  style={{ ...s.voteBtn, ...(f.has_voted ? s.voteBtnActive : {}) }}
                  onClick={() => toggleVote(f.id)}
                  aria-label={f.has_voted ? 'Remove vote' : 'Vote for this'}
                >
                  <ChevronUp size={15} />
                  <span style={s.voteCount}>{f.vote_count}</span>
                </button>
                <div style={{ flex: 1 }}>
                  <div style={s.featureTop}>
                    <p style={s.featureTitle}>{f.title}</p>
                    <span style={{ ...s.badge, background: sc.bg, color: sc.color }}>
                      {STATUS_LABEL[f.status] || f.status}
                    </span>
                  </div>
                  {f.description && <p style={s.featureDesc}>{f.description}</p>}
                  <p style={s.featureMeta}>Suggested by {f.submitted_by}</p>
                </div>
              </div>
            )
          })}
        </>
      )}

      {tab === 'send' && (
        <form style={s.feedbackCard} onSubmit={submitFeedback}>
          <p style={s.newFeatureLabel}>Send feedback</p>
          <p style={s.muted}>Bug reports, rough edges, anything — this goes straight to us, not a public board.</p>
          <div style={s.chipRow}>
            {['general', 'bug', 'idea'].map(c => (
              <button
                key={c}
                type="button"
                style={{ ...s.chip, ...(feedbackCategory === c ? s.chipActive : {}) }}
                onClick={() => setFeedbackCategory(c)}
              >
                {c === 'general' ? 'General' : c === 'bug' ? 'Bug report' : 'Idea'}
              </button>
            ))}
          </div>
          <textarea
            style={s.textarea}
            rows={6}
            placeholder="What's on your mind?"
            value={feedbackMessage}
            onChange={e => setFeedbackMessage(e.target.value)}
          />
          <button style={{ ...s.btn, ...(sendingFeedback || !feedbackMessage.trim() ? s.btnDisabled : {}) }}
            disabled={sendingFeedback || !feedbackMessage.trim()}>
            {sendingFeedback ? 'Sending...' : 'Send feedback'}
          </button>
          {feedbackSent && <p style={s.sentNote}>Sent — thank you.</p>}
        </form>
      )}

      <style>{`
        @keyframes osfFbShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
        .osf-fb-skel {
          border-radius: 4px;
          background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
          background-size: 400% 100%;
          animation: osfFbShimmer 1.6s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) { .osf-fb-skel { animation: none; } }
      `}</style>
    </div>
  )
}

const s = {
  wrap:        { maxWidth: '700px', margin: '0 auto', padding: '2.5rem 1.5rem', background: '#FFFFFF', minHeight: '100vh', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  back:        { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#8A8779', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0, fontFamily: 'inherit' },
  title:       { color: '#0A1A2F', margin: '0 0 1.5rem', fontSize: '22px', fontWeight: 600, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  err:         { color: '#B3453B', fontSize: '14px', marginBottom: '1rem' },
  muted:       { color: '#8A8779', fontSize: '13.5px', lineHeight: 1.6, margin: '0 0 1rem' },

  tabs:        { display: 'flex', gap: 0, marginBottom: '1.75rem', borderBottom: '1px solid #E5E2DB' },
  tab:         { background: 'none', border: 'none', color: '#8A8779', fontSize: '14px', cursor: 'pointer', padding: '10px 18px', borderBottom: '2px solid transparent', marginBottom: '-1px', fontFamily: 'inherit' },
  tabActive:   { color: '#0A1A2F', borderBottomColor: '#0A1A2F' },

  newFeatureCard: { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' },
  feedbackCard:   { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '1.5rem' },
  newFeatureLabel:{ color: '#0A1A2F', fontSize: '13.5px', fontWeight: 700, margin: '0 0 10px' },
  input:       { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E5E2DB', background: '#FFFFFF', color: '#2B2A26', fontSize: '14px', marginBottom: '8px', fontFamily: 'inherit', boxSizing: 'border-box' },
  textarea:    { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E5E2DB', background: '#FFFFFF', color: '#2B2A26', fontSize: '14px', resize: 'vertical', marginBottom: '10px', fontFamily: 'inherit', boxSizing: 'border-box' },
  btn:         { padding: '9px 18px', borderRadius: '8px', background: '#0A1A2F', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13.5px', fontFamily: 'inherit' },
  btnDisabled: { opacity: 0.55, cursor: 'default' },
  sentNote:    { color: '#3F6249', fontSize: '13px', margin: '10px 0 0' },

  chipRow:     { display: 'flex', gap: '8px', marginBottom: '12px' },
  chip:        { padding: '7px 14px', borderRadius: '20px', border: '1px solid #E5E2DB', background: '#FFFFFF', color: '#8A8779', fontSize: '12.5px', cursor: 'pointer', fontFamily: 'inherit' },
  chipActive:  { background: '#0A1A2F', color: '#fff', borderColor: '#0A1A2F' },

  featureRow:  { display: 'flex', gap: '14px', alignItems: 'flex-start', background: '#FFFFFF', border: '1px solid #E5E2DB', borderRadius: '10px', padding: '1rem 1.1rem', marginBottom: '10px' },
  voteBtn:     { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '46px', padding: '8px 4px', borderRadius: '8px', border: '1px solid #E5E2DB', background: '#F7F6F3', color: '#8A8779', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' },
  voteBtnActive:{ background: '#0A1A2F', color: '#fff', borderColor: '#0A1A2F' },
  voteCount:   { fontSize: '13px', fontWeight: 700 },

  featureTop:  { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' },
  featureTitle:{ color: '#0A1A2F', fontSize: '14.5px', fontWeight: 600, margin: 0 },
  featureDesc: { color: '#46443E', fontSize: '13px', lineHeight: 1.5, margin: '0 0 6px' },
  featureMeta: { color: '#8A8779', fontSize: '11.5px', margin: 0 },
  badge:       { fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', letterSpacing: '0.04em', whiteSpace: 'nowrap' },
}