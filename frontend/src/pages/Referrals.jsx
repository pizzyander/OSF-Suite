import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Copy, Check, Users } from 'lucide-react'
import { api } from '../api'

export default function Referrals({ token }) {
  const navigate = useNavigate()
  const [linkInfo, setLinkInfo] = useState(null)
  const [stats, setStats] = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api.getReferralLink(token), api.getReferralStats(token)])
      .then(([link, s]) => {
        setLinkInfo(link)
        setStats(s)
      })
      .catch(err => setError(err.message))
  }, [token])

  const copyLink = () => {
    if (!linkInfo) return
    navigator.clipboard.writeText(linkInfo.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate({ to: '/' })}>
        <ArrowLeft size={13} style={{ marginRight: '5px', verticalAlign: '-2px' }} /> Dashboard
      </button>
      <h1 style={s.title}>Your referral link</h1>
      <p style={s.sub}>Earn 20% of your referral's first payment when they subscribe.</p>

      {error && <p style={s.error}>{error}</p>}

      {linkInfo && (
        <div style={s.linkBox}>
          <span style={s.linkText}>{linkInfo.link}</span>
          <button style={s.copyBtn} onClick={copyLink}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {stats && (
        <>
          <div style={s.statsRow}>
            <div style={s.statCard}>
              <span style={s.statLabel}>Total referred</span>
              <span style={s.statValue}>{stats.total_referred}</span>
            </div>
            <div style={s.statCard}>
              <span style={s.statLabel}>Converted</span>
              <span style={s.statValue}>{stats.total_converted}</span>
            </div>
            <div style={s.statCard}>
              <span style={s.statLabel}>Owed to you</span>
              <span style={s.statValue}>
                {Object.entries(stats.reward_totals_by_currency).length === 0
                  ? '—'
                  : Object.entries(stats.reward_totals_by_currency)
                      .map(([cur, amt]) => `${cur === 'USD' ? '$' : '\u20a6'}${amt.toLocaleString()}`)
                      .join(' + ')}
              </span>
            </div>
          </div>

          <h3 style={s.listTitle}>Referral history</h3>
          {stats.referrals.length === 0 ? (
            <p style={s.empty}><Users size={16} style={{ verticalAlign: '-3px', marginRight: '6px' }} />No referrals yet — share your link to get started.</p>
          ) : (
            <div style={s.list}>
              {stats.referrals.map((r, i) => (
                <div key={i} style={s.row}>
                  <span style={{ ...s.pill, ...(r.status === 'converted' ? s.pillConverted : s.pillPending) }}>
                    {r.status === 'converted' ? 'Converted' : 'Signed up'}
                  </span>
                  <span style={s.rowDate}>{new Date(r.created_at).toLocaleDateString()}</span>
                  {r.status === 'converted' && (
                    <span style={s.rowReward}>
                      {r.reward_currency === 'USD' ? '$' : '\u20a6'}{r.reward_amount?.toLocaleString()}
                      {' '}({r.reward_status === 'applied' ? 'paid' : 'pending'})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const s = {
  wrap:       { maxWidth: '700px', margin: '0 auto', padding: '2.5rem 1.5rem', background: '#FFFFFF', minHeight: '100vh', fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" },
  back:       { display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: '#8A8779', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0, fontFamily: 'inherit' },
  title:      { color: '#0A1A2F', margin: '0 0 8px', fontSize: '24px', fontWeight: 700, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  sub:        { color: '#8A8779', fontSize: '14px', margin: '0 0 1.75rem' },
  error:      { color: '#B3453B', fontSize: '14px', marginBottom: '1.5rem' },
  linkBox:    { display: 'flex', alignItems: 'center', gap: '10px', background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '10px', padding: '12px 14px', marginBottom: '2rem' },
  linkText:   { flex: 1, fontSize: '13.5px', color: '#2B2A26', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  copyBtn:    { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '7px', background: '#0A1A2F', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  statsRow:   { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '2rem' },
  statCard:   { background: '#F7F6F3', border: '1px solid #E5E2DB', borderRadius: '12px', padding: '16px', textAlign: 'center' },
  statLabel:  { display: 'block', color: '#8A8779', fontSize: '12px', marginBottom: '6px' },
  statValue:  { display: 'block', color: '#0A1A2F', fontSize: '22px', fontWeight: 700, fontFamily: "'Space Grotesk', 'Inter', sans-serif" },
  listTitle:  { color: '#0A1A2F', fontSize: '16px', fontWeight: 600, margin: '0 0 12px' },
  empty:      { color: '#8A8779', fontSize: '14px' },
  list:       { display: 'flex', flexDirection: 'column', gap: '8px' },
  row:        { display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', background: '#F7F6F3', borderRadius: '8px', fontSize: '13px' },
  pill:       { fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px' },
  pillConverted: { background: '#E6F0E9', color: '#3F6249' },
  pillPending:   { background: '#F6ECD9', color: '#8F6423' },
  rowDate:    { color: '#8A8779', flex: 1 },
  rowReward:  { color: '#0A1A2F', fontWeight: 600 },
}
