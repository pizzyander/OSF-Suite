import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { ArrowLeft, UserPlus, Mail, X } from 'lucide-react'
import { api } from '../api'

const EASE = [0.22, 0.61, 0.36, 1]

export default function Team({ token, profile }) {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteManagerId, setInviteManagerId] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [membersData, invitesData] = await Promise.all([
        api.listMembers(token),
        api.listInvites(token),
      ])
      setMembers(membersData.members || [])
      setInvites(invitesData.invites || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { load() }, [load])

  const managers = members.filter(m => m.role === 'admin' || m.role === 'manager')

  const sendInvite = async (e) => {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      await api.createInvite(token, inviteEmail.trim(), inviteRole, inviteManagerId || null)
      setInviteEmail('')
      setInviteRole('member')
      setInviteManagerId('')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  const revokeInvite = async (inviteId) => {
    try {
      await api.revokeInvite(token, inviteId)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const changeRole = async (agentId, newRole) => {
    try {
      await api.updateMember(token, agentId, { role: newRole })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const changeManager = async (agentId, newManagerId) => {
    try {
      await api.updateMember(token, agentId, { manager_id: newManagerId || null })
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  const managerName = (managerId) => members.find(m => m.agent_id === managerId)?.name || 'N/A'

  const roleBadgeStyle = (role) => ({
    admin:   { bg: 'linear-gradient(135deg, var(--navy-900), var(--navy-700))', color: '#fff' },
    manager: { bg: 'var(--accent-soft)', color: 'var(--accent-strong)' },
    member:  { bg: 'rgba(47,156,142,.14)', color: 'var(--teal)' },
  }[role] || { bg: '#EAF0F5', color: '#2C5478' })

  if (profile && profile.role !== 'admin') {
    return (
      <div className="osf-team">
        <style>{TEAM_STYLES}</style>
        <div className="osf-team-wrap">
          <p className="osf-team-err">Only organization admins can view this page.</p>
          <button className="osf-team-back" onClick={() => navigate({ to: '/' })}>
            <ArrowLeft size={13} /> Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="osf-team">
      <style>{TEAM_STYLES}</style>
      <div className="osf-team-aurora" aria-hidden="true">
        <motion.div className="osf-team-blob a"
          animate={reduce ? undefined : { x: [0, 24, -10, 0], y: [0, -16, 12, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <div className="osf-team-wrap">
        <button className="osf-team-back" onClick={() => navigate({ to: '/' })}>
          <ArrowLeft size={13} /> Dashboard
        </button>
        <h1 className="osf-team-title">Team</h1>
        <p className="osf-team-sub">{profile?.org_name}</p>

        {error && <p className="osf-team-err">{error}</p>}

        {/* -- Invite form -- */}
        <motion.div className="osf-team-card osf-team-invite-card"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}>
          <h3 className="osf-team-section-title"><UserPlus size={13} /> Invite a teammate</h3>
          <form onSubmit={sendInvite} className="osf-team-invite-form">
            <input
              className="osf-team-input"
              type="email"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              required
            />
            <select className="osf-team-select" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              <option value="member">Member</option>
              <option value="manager">Manager</option>
            </select>
            {inviteRole === 'member' && managers.length > 0 && (
              <select className="osf-team-select" value={inviteManagerId} onChange={e => setInviteManagerId(e.target.value)}>
                <option value="">No manager (reports to no one)</option>
                {managers.map(m => (
                  <option key={m.agent_id} value={m.agent_id}>Reports to {m.name}</option>
                ))}
              </select>
            )}
            <button className="osf-team-btn-primary" disabled={sending || !inviteEmail.trim()}>
              {sending ? 'Sending...' : 'Send invite'}
            </button>
          </form>
        </motion.div>

        {/* -- Pending invites -- */}
        {loading && (
          <div className="osf-team-section">
            <h3 className="osf-team-section-title">Pending invites</h3>
            <div className="osf-team-row">
              <div style={{ flex: 1 }}>
                <div className="osf-team-skel" style={{ width: '140px', height: '11px', marginBottom: '8px' }} />
                <div className="osf-team-skel" style={{ width: '100px', height: '9px' }} />
              </div>
            </div>
          </div>
        )}
        {!loading && invites.filter(i => i.status === 'pending').length > 0 && (
          <div className="osf-team-section">
            <h3 className="osf-team-section-title"><Mail size={13} /> Pending invites</h3>
            <AnimatePresence>
              {invites.filter(i => i.status === 'pending').map(i => (
                <motion.div key={i.invite_id} className="osf-team-row"
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.3, ease: EASE }}>
                  <div>
                    <p className="osf-team-row-name">{i.email}</p>
                    <p className="osf-team-row-meta">{i.role} · expires {new Date(i.expires_at).toLocaleDateString()}</p>
                  </div>
                  <button className="osf-team-btn-revoke" onClick={() => revokeInvite(i.invite_id)}>
                    <X size={12} /> Revoke
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* -- Member roster -- */}
        <div className="osf-team-section">
          <h3 className="osf-team-section-title">Members {!loading && `(${members.length})`}</h3>
          {loading && [0, 1, 2].map(i => (
            <div key={i} className="osf-team-row">
              <div style={{ flex: 1 }}>
                <div className="osf-team-skel" style={{ width: '130px', height: '11px', marginBottom: '8px' }} />
                <div className="osf-team-skel" style={{ width: '180px', height: '9px' }} />
              </div>
              <div className="osf-team-skel" style={{ width: '80px', height: '26px' }} />
            </div>
          ))}
          {!loading && members.map((m, idx) => {
            const rb = roleBadgeStyle(m.role)
            return (
              <motion.div key={m.agent_id} className="osf-team-row"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: idx * 0.04, ease: EASE }}>
                <div>
                  <div className="osf-team-row-nametop">
                    <p className="osf-team-row-name">{m.name}</p>
                    <span className="osf-team-role-badge" style={{ background: rb.bg, color: rb.color }}>
                      {m.role}
                    </span>
                  </div>
                  <p className="osf-team-row-meta">{m.email}{m.job_title && ` · ${m.job_title}`}</p>
                  {m.role === 'member' && (
                    <p className="osf-team-row-meta">Reports to: {managerName(m.manager_id)}</p>
                  )}
                </div>
                <div className="osf-team-row-controls">
                  <select
                    className="osf-team-select-small"
                    value={m.role}
                    onChange={e => changeRole(m.agent_id, e.target.value)}
                  >
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="member">Member</option>
                  </select>
                  {m.role === 'member' && (
                    <select
                      className="osf-team-select-small"
                      value={m.manager_id || ''}
                      onChange={e => changeManager(m.agent_id, e.target.value)}
                    >
                      <option value="">No manager</option>
                      {managers.filter(mg => mg.agent_id !== m.agent_id).map(mg => (
                        <option key={mg.agent_id} value={mg.agent_id}>{mg.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const TEAM_STYLES = `
  .osf-team{
    --navy-950:#08172A; --navy-900:#0A1A2F; --navy-700:#1B3A5C;
    --bg:#FCFBF9; --bg-soft:#F5F3EE; --line:#E5E2DB; --line-strong:#D8D4C9;
    --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
    --accent:#C79541; --accent-soft:#F6ECD9; --accent-strong:#8F6423; --teal:#2F9C8E; --danger:#B3453B;
    --ease:cubic-bezier(.22,.61,.36,1);
    background:var(--bg); min-height:100vh; position:relative; overflow:hidden;
    font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--text-body);
  }
  .osf-team *{box-sizing:border-box;}
  .osf-team-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;}
  .osf-team-blob{position:absolute;border-radius:50%;filter:blur(100px);opacity:.35;}
  .osf-team-blob.a{width:480px;height:480px;top:-200px;right:-160px;
    background:radial-gradient(circle,rgba(199,149,65,.4),transparent 70%);}
  .osf-team-wrap{position:relative;z-index:1;max-width:760px;margin:0 auto;padding:2.5rem 1.5rem 4rem;}
  .osf-team-back{display:inline-flex;align-items:center;gap:5px;background:none;border:none;
    color:var(--text-muted);cursor:pointer;font-size:14px;margin-bottom:1.5rem;padding:0;
    font-family:inherit;transition:color .2s var(--ease);}
  .osf-team-back:hover{color:var(--navy-900);}
  .osf-team-title{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
    margin:0 0 4px;font-size:26px;font-weight:700;letter-spacing:-.02em;}
  .osf-team-sub{color:var(--accent-strong);font-size:14px;font-weight:600;margin:0 0 2rem;}
  .osf-team-err{color:var(--danger);font-size:14px;margin-bottom:1rem;
    background:rgba(179,69,59,.07);border:1px solid rgba(179,69,59,.2);padding:10px 13px;border-radius:9px;}

  .osf-team-card{background:rgba(255,255,255,.85);backdrop-filter:blur(10px);
    border:1px solid var(--line);border-radius:16px;padding:1.5rem;margin-bottom:2rem;
    box-shadow:0 20px 44px -30px rgba(10,26,47,.35);}
  .osf-team-section{margin-bottom:2.5rem;}
  .osf-team-section-title{display:flex;align-items:center;gap:7px;color:var(--text-muted);
    font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;
    margin:0 0 1rem;font-family:'IBM Plex Mono',monospace;}

  .osf-team-invite-form{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}
  .osf-team-input{flex:1 1 220px;padding:11px 14px;border-radius:9px;border:1px solid var(--line);
    background:#fff;color:var(--text);font-size:14px;font-family:inherit;
    transition:border-color .25s var(--ease),box-shadow .25s var(--ease),transform .25s var(--ease);}
  .osf-team-input:focus{outline:none;border-color:var(--accent);
    box-shadow:0 0 0 4px rgba(199,149,65,.16);transform:translateY(-1px);}
  .osf-team-select{padding:11px 12px;border-radius:9px;border:1px solid var(--line);background:#fff;
    color:var(--text);font-size:13px;font-family:inherit;cursor:pointer;}
  .osf-team-select-small{padding:6px 10px;border-radius:7px;border:1px solid var(--line);background:#fff;
    color:var(--text-body);font-size:12px;font-family:inherit;cursor:pointer;}

  .osf-team-btn-primary{position:relative;overflow:hidden;padding:11px 20px;border-radius:9px;border:none;
    background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;font-weight:600;
    cursor:pointer;font-size:13.5px;font-family:inherit;
    box-shadow:0 14px 26px -16px rgba(10,26,47,.8);
    transition:transform .25s var(--ease),box-shadow .25s var(--ease),opacity .2s var(--ease);}
  .osf-team-btn-primary::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
    transform:translateX(-140%) skewX(-18deg);}
  .osf-team-btn-primary:hover:not(:disabled)::after{transition:transform .8s var(--ease);transform:translateX(300%) skewX(-18deg);}
  .osf-team-btn-primary:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 18px 34px -16px rgba(10,26,47,.75);}
  .osf-team-btn-primary:disabled{opacity:.55;cursor:default;}

  .osf-team-btn-revoke{display:inline-flex;align-items:center;gap:4px;background:none;
    border:1px solid rgba(179,69,59,.35);border-radius:7px;color:var(--danger);cursor:pointer;
    font-size:12px;padding:6px 12px;font-family:inherit;transition:background .2s var(--ease);}
  .osf-team-btn-revoke:hover{background:rgba(179,69,59,.08);}

  .osf-team-row{display:flex;justify-content:space-between;align-items:center;
    background:rgba(255,255,255,.7);backdrop-filter:blur(6px);border:1px solid var(--line);
    border-radius:12px;padding:1rem 1.25rem;margin-bottom:10px;flex-wrap:wrap;gap:10px;
    transition:transform .3s var(--ease),box-shadow .3s var(--ease),border-color .3s var(--ease);}
  .osf-team-row:hover{transform:translateY(-2px);border-color:rgba(199,149,65,.4);
    box-shadow:0 16px 34px -26px rgba(10,26,47,.4);}
  .osf-team-row-nametop{display:flex;align-items:center;gap:8px;margin-bottom:2px;}
  .osf-team-row-name{color:var(--navy-950);font-size:14px;font-weight:600;margin:0;}
  .osf-team-row-meta{color:var(--text-muted);font-size:12px;margin:0;}
  .osf-team-role-badge{font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;
    text-transform:uppercase;letter-spacing:.04em;}
  .osf-team-row-controls{display:flex;gap:8px;}

  .osf-team-skel{border-radius:4px;
    background:linear-gradient(90deg,var(--accent-soft) 25%,#FBF4E6 37%,var(--accent-soft) 63%);
    background-size:400% 100%;animation:osfTeamShimmer 1.6s ease-in-out infinite;}
  @keyframes osfTeamShimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}
  @media (prefers-reduced-motion:reduce){ .osf-team-skel{animation:none;} .osf-team-blob{display:none;} }
`
