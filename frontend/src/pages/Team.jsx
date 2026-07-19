import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Team({ token, profile }) {
  const navigate = useNavigate()
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

  const managerName = (managerId) => members.find(m => m.agent_id === managerId)?.name || '—'

  if (profile && profile.role !== 'admin') {
    return (
      <div style={s.wrap}>
        <p style={s.err}>Only organization admins can view this page.</p>
        <button style={s.btnGhost} onClick={() => navigate('/')}>← Dashboard</button>
      </div>
    )
  }

  return (
    <div style={s.wrap}>
      <button style={s.back} onClick={() => navigate('/')}>← Dashboard</button>
      <h2 style={s.title}>Team</h2>
      <p style={s.sub}>{profile?.org_name}</p>

      {error && <p style={s.err}>{error}</p>}
      {loading && <p style={s.muted}>Loading...</p>}

      {/* -- Invite form -- */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>Invite a teammate</h3>
        <form onSubmit={sendInvite} style={s.inviteForm}>
          <input
            style={s.input}
            type="email"
            placeholder="teammate@company.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            required
          />
          <select style={s.select} value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="manager">Manager</option>
          </select>
          {inviteRole === 'member' && managers.length > 0 && (
            <select style={s.select} value={inviteManagerId} onChange={e => setInviteManagerId(e.target.value)}>
              <option value="">No manager (reports to no one)</option>
              {managers.map(m => (
                <option key={m.agent_id} value={m.agent_id}>Reports to {m.name}</option>
              ))}
            </select>
          )}
          <button style={s.btnPrimary} disabled={sending || !inviteEmail.trim()}>
            {sending ? 'Sending...' : 'Send invite'}
          </button>
        </form>
      </div>

      {/* -- Pending invites -- */}
      {invites.filter(i => i.status === 'pending').length > 0 && (
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Pending invites</h3>
          {invites.filter(i => i.status === 'pending').map(i => (
            <div key={i.invite_id} style={s.row}>
              <div>
                <p style={s.rowName}>{i.email}</p>
                <p style={s.rowMeta}>{i.role} · expires {new Date(i.expires_at).toLocaleDateString()}</p>
              </div>
              <button style={s.btnGhostSmall} onClick={() => revokeInvite(i.invite_id)}>Revoke</button>
            </div>
          ))}
        </div>
      )}

      {/* -- Member roster -- */}
      <div style={s.section}>
        <h3 style={s.sectionTitle}>Members ({members.length})</h3>
        {members.map(m => (
          <div key={m.agent_id} style={s.row}>
            <div>
              <p style={s.rowName}>{m.name}</p>
              <p style={s.rowMeta}>{m.email}{m.job_title && ` · ${m.job_title}`}</p>
              {m.role === 'member' && (
                <p style={s.rowMeta}>Reports to: {managerName(m.manager_id)}</p>
              )}
            </div>
            <div style={s.rowControls}>
              <select
                style={s.selectSmall}
                value={m.role}
                onChange={e => changeRole(m.agent_id, e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="member">Member</option>
              </select>
              {m.role === 'member' && (
                <select
                  style={s.selectSmall}
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
          </div>
        ))}
      </div>
    </div>
  )
}

const s = {
  wrap:        { maxWidth: '760px', margin: '0 auto', padding: '2rem 1rem', background: '#0f0f0f', minHeight: '100vh' },
  back:        { background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '14px', marginBottom: '1.5rem', padding: 0 },
  title:       { color: '#fff', margin: '0 0 4px', fontSize: '22px', fontWeight: 600 },
  sub:         { color: '#6c5ce7', fontSize: '14px', fontWeight: 600, margin: '0 0 2rem' },
  section:     { marginBottom: '2.5rem' },
  sectionTitle:{ color: '#aaa', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 1rem' },
  muted:       { color: '#555', fontSize: '14px' },
  err:         { color: '#ff6b6b', fontSize: '14px', marginBottom: '1rem' },
  inviteForm:  { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' },
  input:       { flex: '1 1 220px', padding: '10px 14px', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#151515', color: '#fff', fontSize: '14px' },
  select:      { padding: '10px 12px', borderRadius: '8px', border: '1px solid #2a2a2a', background: '#151515', color: '#fff', fontSize: '13px' },
  selectSmall: { padding: '6px 10px', borderRadius: '6px', border: '1px solid #2a2a2a', background: '#151515', color: '#aaa', fontSize: '12px' },
  btnPrimary:  { padding: '10px 18px', borderRadius: '8px', background: '#6c5ce7', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '13px' },
  btnGhostSmall:{ background: 'none', border: '1px solid #2a2a2a', borderRadius: '6px', color: '#ff6b6b', cursor: 'pointer', fontSize: '12px', padding: '6px 12px' },
  btnGhost:    { padding: '9px 16px', borderRadius: '8px', background: 'transparent', color: '#aaa', border: '1px solid #2a2a2a', cursor: 'pointer', fontSize: '13px' },
  row:         { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' },
  rowName:     { color: '#fff', fontSize: '14px', fontWeight: 600, margin: '0 0 4px' },
  rowMeta:     { color: '#666', fontSize: '12px', margin: 0 },
  rowControls: { display: 'flex', gap: '8px' },
}
