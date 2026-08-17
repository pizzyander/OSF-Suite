import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Check, X } from 'lucide-react'
import { api } from '../api'

export default function Quiz({ token }) {
  const navigate = useNavigate()
  const [quiz, setQuiz] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [current, setCurrent] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.getTodayQuiz(token)
      .then(data => {
        setQuiz(data.quiz)
        if (data.quiz) {
          const firstUnanswered = data.quiz.questions.findIndex(q => q.selected_index == null)
          setCurrent(firstUnanswered === -1 ? 0 : firstUnanswered)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  const selectOption = async (questionId, index) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const { question } = await api.submitQuizAnswer(token, quiz.id, questionId, index)
      setQuiz(prev => ({
        ...prev,
        questions: prev.questions.map(q => (q.id === question.id ? question : q)),
      }))
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={s.wrap}>
        <div className="osf-quiz-skel" style={{ width: '200px', height: '12px', marginBottom: '20px' }} />
        <div className="osf-quiz-skel" style={{ width: '100%', height: '160px', borderRadius: '12px' }} />
        <style>{skelCss}</style>
      </div>
    )
  }

  if (error) return <div style={s.wrap}><p style={s.err}>{error}</p></div>

  if (!quiz) {
    return (
      <div style={s.wrap}>
        <BackButton onClick={() => navigate({ to: '/coaching' })} />
        <h2 style={s.title}>Today's Quiz</h2>
        <div style={s.emptyBox}>
          <p style={s.emptyText}>
            No quiz ready yet — this builds itself once there's enough call history this week to
            base real scenarios on. Check back after a couple more meetings.
          </p>
        </div>
      </div>
    )
  }

  const total = quiz.questions.length
  const answeredCount = quiz.questions.filter(q => q.selected_index != null).length
  const correctCount = quiz.questions.filter(q => q.is_correct).length
  const allDone = answeredCount === total
  const q = quiz.questions[current]

  return (
    <div style={s.wrap}>
      <BackButton onClick={() => navigate({ to: '/coaching' })} />
      <h2 style={s.title}>Today's Quiz</h2>
      {quiz.based_on && <p style={s.based}>Targeting: {quiz.based_on}</p>}

      <ProgressDots total={total} current={current} questions={quiz.questions} onJump={setCurrent} />

      {allDone ? (
        <SummaryCard correct={correctCount} total={total} />
      ) : (
        <QuestionCard
          question={q}
          submitting={submitting}
          onSelect={(idx) => selectOption(q.id, idx)}
          onNext={() => setCurrent(c => Math.min(c + 1, total - 1))}
          isLast={current === total - 1}
        />
      )}

      <style>{skelCss}</style>
    </div>
  )
}

function BackButton({ onClick }) {
  return (
    <button style={s.back} onClick={onClick}>
      <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Coaching
    </button>
  )
}

function ProgressDots({ total, current, questions, onJump }) {
  return (
    <div style={s.dotsRow}>
      {Array.from({ length: total }).map((_, i) => {
        const q = questions[i]
        const answered = q?.selected_index != null
        const dotStyle = {
          ...s.dot,
          ...(i === current ? s.dotActive : {}),
          background: answered ? (q.is_correct ? '#3F6249' : '#B3453B') : (i === current ? '#8F6423' : '#E5E2DB'),
        }
        return <button key={i} style={dotStyle} onClick={() => onJump(i)} aria-label={`Question ${i + 1}`} />
      })}
    </div>
  )
}

function QuestionCard({ question, submitting, onSelect, onNext, isLast }) {
  const answered = question.selected_index != null

  return (
    <div style={s.card}>
      <span style={s.skillTag}>{skillLabel(question.skill_area)}</span>
      <p style={s.scenario}>{question.scenario}</p>

      <div style={s.options}>
        {question.options.map((opt, i) => {
          let optStyle = { ...s.option }
          if (answered) {
            if (i === question.correct_index) optStyle = { ...optStyle, ...s.optionCorrect }
            else if (i === question.selected_index) optStyle = { ...optStyle, ...s.optionWrong }
            else optStyle = { ...optStyle, ...s.optionDimmed }
          }
          return (
            <button
              key={i}
              style={optStyle}
              disabled={answered || submitting}
              onClick={() => onSelect(i)}
            >
              <span>{opt}</span>
              {answered && i === question.correct_index && <Check size={15} color="#3F6249" />}
              {answered && i === question.selected_index && i !== question.correct_index && <X size={15} color="#B3453B" />}
            </button>
          )
        })}
      </div>

      {answered && (
        <div style={s.feedback}>
          <p style={s.feedbackLabel}>{question.is_correct ? "Correct" : "Not quite"}</p>
          <p style={s.explanation}>{question.explanation}</p>
          {!isLast && (
            <button style={s.nextBtn} onClick={onNext}>Next scenario →</button>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ correct, total }) {
  const pct = Math.round((correct / total) * 100)
  return (
    <div style={s.card}>
      <p style={s.summaryScore}>{correct}/{total}</p>
      <p style={s.summaryPct}>{pct}% today</p>
      <p style={s.explanation}>
        {pct >= 80
          ? "Strong day — that's the kind of decision-making the winning-pattern examples are built on."
          : "A rough scenario or two is exactly the point — those are the spots worth revisiting before your next call."}
      </p>
    </div>
  )
}

function skillLabel(area) {
  return {
    objection_handling: 'Objection handling',
    discovery: 'Discovery',
    closing: 'Closing',
    talk_ratio: 'Talk ratio',
    buying_signal: 'Buying signal',
  }[area] || area
}

const skelCss = `
  @keyframes osfQuizShimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }
  .osf-quiz-skel {
    border-radius: 4px;
    background: linear-gradient(90deg, #EDEAE1 25%, #F7F3E9 37%, #EDEAE1 63%);
    background-size: 400% 100%;
    animation: osfQuizShimmer 1.6s ease-in-out infinite;
  }
`

const s = {
  wrap:        { maxWidth: '620px', margin: '0 auto', padding: '2.5rem 1.5rem', background: '#FFFFFF', minHeight: '100vh', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  back:        { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#8A8779', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0, fontFamily: 'inherit' },
  title:       { color: '#0A1A2F', margin: '0 0 6px', fontSize: '22px', fontWeight: 600, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  based:       { color: '#8A8779', fontSize: '13px', margin: '0 0 1.5rem' },
  err:         { color: '#B3453B', fontSize: '14px' },
  emptyBox:    { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '2rem', textAlign: 'center' },
  emptyText:   { color: '#8A8779', fontSize: '14px', lineHeight: 1.6, margin: 0 },

  dotsRow:     { display: 'flex', gap: '8px', marginBottom: '1.5rem' },
  dot:         { width: '28px', height: '6px', borderRadius: '3px', border: 'none', cursor: 'pointer', padding: 0 },
  dotActive:   { boxShadow: '0 0 0 2px #0A1A2F22' },

  card:        { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '1.75rem' },
  skillTag:    { display: 'inline-block', color: '#8F6423', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' },
  scenario:    { color: '#2B2A26', fontSize: '15px', lineHeight: 1.7, margin: '0 0 1.5rem' },

  options:     { display: 'flex', flexDirection: 'column', gap: '10px' },
  option:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left', width: '100%', background: '#FFFFFF', border: '1px solid #E5E2DB', borderRadius: '8px', padding: '0.85rem 1rem', fontSize: '14px', color: '#2B2A26', cursor: 'pointer', fontFamily: 'inherit' },
  optionCorrect: { borderColor: '#3F6249', background: '#EFF4F0' },
  optionWrong:   { borderColor: '#B3453B', background: '#FBEFED' },
  optionDimmed:  { opacity: 0.5 },

  feedback:    { marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #E5E2DB' },
  feedbackLabel: { fontSize: '13px', fontWeight: 700, color: '#0A1A2F', margin: '0 0 6px' },
  explanation: { color: '#46443E', fontSize: '13.5px', lineHeight: 1.6, margin: 0 },
  nextBtn:     { marginTop: '1rem', background: '#0A1A2F', color: '#FFFFFF', border: 'none', borderRadius: '8px', padding: '0.65rem 1.25rem', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' },

  summaryScore: { fontSize: '40px', fontWeight: 700, color: '#0A1A2F', margin: 0, fontFamily: "'Space Grotesk', sans-serif" },
  summaryPct:   { color: '#8A8779', fontSize: '13px', margin: '2px 0 1rem' },
}