import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import {
  RefreshCw, ArrowRight, LayoutGrid, X, GraduationCap, Tag, CreditCard,
  Share2, BarChart3, Users, FileText, LogOut, Sparkles, Video,
} from 'lucide-react'
import { api } from '../api'

const EASE = [0.22, 0.61, 0.36, 1]
const WELCOME_SEEN_KEY = 'osf_welcome_shown'

export default function Dashboard({ token, profile, onLogout }) {
  const [meetings, setMeetings] = useState([])
  const [agent, setAgent]       = useState(profile || null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [trialStatus, setTrialStatus] = useState(null)
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const closeTimer = useRef(null)

  const fetchMeetings = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getMeetings(token)
      setMeetings(data.meetings || [])
    } catch (err) {
      setError(`Failed to load meetings: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!profile) {
      api.me(token).then(setAgent).catch(() => onLogout())
    }
    fetchMeetings()
    api.getTrialStatus(token)
      .then(setTrialStatus)
      .catch(err => console.error('Failed to load trial status (non-fatal):', err))
  }, [])

  // Fresh-user welcome: shows once per browser (localStorage flag) for an
  // account with zero completed meetings. Trial numbers shown (meetings
  // left, days left) come from GET /billing/trial-status — real,
  // enforced values, not hardcoded copy (see billing_guard.py,
  // db_trial.py, and main.py's /meetings/start for the enforcement side).
  useEffect(() => {
    if (!loading && trialStatus && meetings.length === 0 && !localStorage.getItem(WELCOME_SEEN_KEY)) {
      setShowWelcome(true)
    }
  }, [loading, meetings, trialStatus])

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_SEEN_KEY, '1')
    setShowWelcome(false)
  }

  const startFirstMeeting = () => {
    dismissWelcome()
    navigate({ to: '/meeting' })
  }

  const openMenu = () => { clearTimeout(closeTimer.current); setMenuOpen(true) }
  const scheduleCloseMenu = () => { closeTimer.current = setTimeout(() => setMenuOpen(false), 220) }
  const goTo = (path) => { setMenuOpen(false); navigate({ to: path }) }

  const dealColor = (score) =>
    score === 'hot'  ? '#B3453B' :
    score === 'warm' ? '#8F6423' : '#2C5478'

  const dealBg = (score) =>
    score === 'hot'  ? '#F7E9E7' :
    score === 'warm' ? '#F6ECD9' : '#EAF0F5'

  const dealWidth = (score) =>
    score === 'hot'  ? '100%' :
    score === 'warm' ? '60%'  : '25%'

  const menuItems = [
    { label: 'Coaching', icon: GraduationCap, path: '/coaching' },
    { label: 'Pricing', icon: Tag, path: '/pricing' },
    { label: 'Billing', icon: CreditCard, path: '/billing' },
    { label: 'Referrals', icon: Share2, path: '/referrals' },
    ...(agent?.role === 'admin' || agent?.role === 'manager'
      ? [{ label: 'Team performance', icon: BarChart3, path: '/manager' }] : []),
    ...(agent?.role === 'admin'
      ? [{ label: 'Team', icon: Users, path: '/team' }] : []),
    { label: 'Manage company context', icon: FileText, path: '/context' },
  ]

  return (
    <div className="osf-dash">
      <style>{DASH_STYLES}</style>
      <div className="osf-dash-aurora" aria-hidden="true">
        <motion.div className="osf-dash-blob a"
          animate={reduce ? undefined : { x: [0, 24, -10, 0], y: [0, -16, 12, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <div className="osf-dash-wrap">
        {/* Header */}
        <div className="osf-dash-header">
          <div>
            <OsfLogoMark style={{ height: '26px', width: 'auto', display: 'block' }} />
            {agent && (
              <p className="osf-dash-sub">
                {agent.name} · {agent.email}
                {agent.org_name && (
                  <>
                    {' · '}
                    <span className="osf-dash-org-badge">{agent.org_name}</span>
                    {agent.role && <span className="osf-dash-role-tag"> ({agent.role})</span>}
                  </>
                )}
              </p>
            )}
          </div>
          <div className="osf-dash-actions">
            <button className="osf-dash-btn-primary" onClick={() => navigate({ to: '/meeting' })}>
              + New meeting
            </button>

            <div
              className="osf-dash-menu-anchor"
              onMouseEnter={openMenu}
              onMouseLeave={scheduleCloseMenu}
            >
              <button
                className="osf-dash-menu-trigger"
                onClick={() => setMenuOpen(o => !o)}
                aria-label="More options"
                aria-expanded={menuOpen}
              >
                <LayoutGrid size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Section title */}
        <h3 className="osf-dash-section-title">
          Recent meetings {meetings.length > 0 && `(${meetings.length})`}
        </h3>

        {error && <p className="osf-dash-err">{error}</p>}

        {/* Loading skeleton */}
        {loading && (
          <div className="osf-dash-grid">
            {[0, 1, 2].map(i => (
              <div key={i} className="osf-dash-card">
                <div className="osf-dash-card-top">
                  <div className="osf-dash-skel" style={{ width: '90px' }} />
                  <div className="osf-dash-skel" style={{ width: '46px', borderRadius: '20px' }} />
                </div>
                <div className="osf-dash-skel" style={{ height: '30px', borderRadius: '6px' }} />
                <div className="osf-dash-skel" style={{ width: '60%' }} />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && meetings.length === 0 && (
          <div className="osf-dash-empty-box">
            <p className="osf-dash-empty-title">No completed meetings yet</p>
            <p className="osf-dash-empty-sub">
              Start a new meeting or upload a recording to see insights here.
            </p>
            <button className="osf-dash-btn-primary" onClick={() => navigate({ to: '/meeting' })}>
              + New meeting
            </button>
          </div>
        )}

        {/* Meeting grid */}
        {!loading && meetings.length > 0 && (
          <div className="osf-dash-grid">
            {meetings.map((m, idx) => {
              const score = m.deal_health
              const date  = new Date(m.created_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'short', year: 'numeric'
              })
              const time  = new Date(m.created_at).toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit'
              })

              return (
                <motion.div
                  key={m.meeting_id}
                  className="osf-dash-card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.4), ease: EASE }}
                  onClick={() => navigate({ to: '/meeting/$id', params: { id: m.meeting_id } })}
                >
                  <div className="osf-dash-card-top">
                    <span className="osf-dash-card-date">{date} · {time}</span>
                    {score && (
                      <span className="osf-dash-badge" style={{ background: dealBg(score), color: dealColor(score) }}>
                        {score.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="osf-dash-deal-row">
                    <div className="osf-dash-deal-bar-fill" style={{
                      width: dealWidth(score),
                      background: score ? dealColor(score) : '#D8D4C9',
                    }} />
                    <span className="osf-dash-deal-text" style={{ color: score ? dealColor(score) : '#8A8779' }}>
                      {score ? `Deal is ${score}` : 'No analysis yet'}
                    </span>
                  </div>

                  <p className="osf-dash-card-footer">View full report <ArrowRight size={12} style={{ verticalAlign: '-1px' }} /></p>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>

      {/* Backdrop + side tray */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="osf-dash-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMenuOpen(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="osf-dash-tray"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: EASE }}
            onMouseEnter={openMenu}
            onMouseLeave={scheduleCloseMenu}
          >
            <div className="osf-dash-tray-header">
              <span className="osf-dash-tray-title">Menu</span>
              <button className="osf-dash-tray-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                <X size={16} />
              </button>
            </div>
            <div className="osf-dash-tray-list">
              {menuItems.map(item => (
                <button key={item.path} className="osf-dash-tray-item" onClick={() => goTo(item.path)}>
                  <item.icon size={16} />
                  <span>{item.label}</span>
                </button>
              ))}
              <button className="osf-dash-tray-item" onClick={() => { setMenuOpen(false); fetchMeetings() }}>
                <RefreshCw size={16} />
                <span>Refresh meetings</span>
              </button>
            </div>
            <div className="osf-dash-tray-footer">
              <button className="osf-dash-tray-item osf-dash-tray-signout" onClick={onLogout}>
                <LogOut size={16} />
                <span>Sign out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Welcome popup for fresh users */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            className="osf-dash-welcome-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              className="osf-dash-welcome-card"
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              transition={{ duration: 0.5, ease: EASE }}
            >
              <div className="osf-dash-welcome-aurora" aria-hidden="true">
                <motion.div className="osf-dash-welcome-blob a"
                  animate={reduce ? undefined : { x: [0, 20, -8, 0], y: [0, -14, 10, 0] }}
                  transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }} />
                <motion.div className="osf-dash-welcome-blob b"
                  animate={reduce ? undefined : { x: [0, -16, 12, 0], y: [0, 12, -8, 0] }}
                  transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }} />
              </div>

              <button className="osf-dash-welcome-close" onClick={dismissWelcome} aria-label="Close">
                <X size={16} />
              </button>

              <div className="osf-dash-welcome-body">
                <span className="osf-dash-welcome-icon"><Sparkles size={22} /></span>
                <h2>Welcome to OSF-Suite</h2>
                <p className="osf-dash-welcome-sub">
                  You're all set. Start your first call and see live coaching nudges, objection
                  cards, and a full report the moment it ends.
                </p>

                {trialStatus?.has_subscription ? (
                  <div className="osf-dash-welcome-trial">
                    <span className="osf-dash-welcome-trial-badge">Active plan</span>
                    <span className="osf-dash-welcome-trial-text">You're all set — no limits</span>
                  </div>
                ) : (
                  <div className="osf-dash-welcome-trial">
                    <span className="osf-dash-welcome-trial-badge">
                      {(trialStatus?.days_left ?? trialStatus?.days_total ?? 7)}-day trial
                    </span>
                    <span className="osf-dash-welcome-trial-text">
                      {(trialStatus?.meetings_remaining ?? trialStatus?.meetings_cap ?? 5)} meeting
                      {(trialStatus?.meetings_remaining ?? trialStatus?.meetings_cap ?? 5) !== 1 ? 's' : ''} left, free, no card required
                    </span>
                  </div>
                )}

                <button className="osf-dash-welcome-cta" onClick={startFirstMeeting}>
                  <Video size={16} />
                  Start my first meeting
                </button>
                <button className="osf-dash-welcome-later" onClick={dismissWelcome}>
                  Maybe later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const DASH_STYLES = `
  .osf-dash{
    --navy-950:#08172A; --navy-900:#0A1A2F; --navy-700:#1B3A5C;
    --bg:#FCFBF9; --line:#E5E2DB; --line-strong:#D8D4C9;
    --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
    --accent:#C79541; --accent-soft:#F6ECD9; --accent-strong:#8F6423; --teal:#2F9C8E; --danger:#B3453B;
    --ease:cubic-bezier(.22,.61,.36,1);
    background:var(--bg); min-height:100vh; position:relative; overflow-x:hidden;
    font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:var(--text-body);
  }
  .osf-dash *{box-sizing:border-box;}
  .osf-dash-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0;}
  .osf-dash-blob{position:absolute;border-radius:50%;filter:blur(110px);opacity:.3;}
  .osf-dash-blob.a{width:480px;height:480px;top:-200px;right:-160px;
    background:radial-gradient(circle,rgba(199,149,65,.4),transparent 70%);}
  .osf-dash-wrap{position:relative;z-index:1;max-width:900px;margin:0 auto;padding:2.5rem 1.5rem 4rem;}

  .osf-dash-header{display:flex;justify-content:space-between;align-items:flex-start;
    margin-bottom:2rem;flex-wrap:wrap;gap:1rem;padding-bottom:1.75rem;border-bottom:1px solid var(--line);}
  .osf-dash-sub{color:var(--text-muted);margin:8px 0 0;font-size:13px;}
  .osf-dash-org-badge{color:var(--navy-700);font-weight:600;}
  .osf-dash-role-tag{color:var(--text-muted);}
  .osf-dash-actions{display:flex;align-items:center;gap:10px;}

  .osf-dash-btn-primary{position:relative;overflow:hidden;padding:11px 20px;border-radius:9px;border:none;
    background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;font-weight:600;
    cursor:pointer;font-size:13.5px;font-family:inherit;
    box-shadow:0 14px 26px -16px rgba(10,26,47,.8);
    transition:transform .25s var(--ease),box-shadow .25s var(--ease);}
  .osf-dash-btn-primary::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
    transform:translateX(-140%) skewX(-18deg);}
  .osf-dash-btn-primary:hover::after{transition:transform .8s var(--ease);transform:translateX(300%) skewX(-18deg);}
  .osf-dash-btn-primary:hover{transform:translateY(-2px);box-shadow:0 18px 34px -16px rgba(10,26,47,.75);}

  .osf-dash-menu-anchor{position:relative;}
  .osf-dash-menu-trigger{display:flex;align-items:center;justify-content:center;width:40px;height:40px;
    border-radius:10px;background:rgba(255,255,255,.7);border:1px solid var(--line);color:var(--navy-700);
    cursor:pointer;transition:all .25s var(--ease);}
  .osf-dash-menu-trigger:hover{border-color:rgba(199,149,65,.5);background:var(--accent-soft);color:var(--accent-strong);
    transform:translateY(-2px);}

  .osf-dash-backdrop{position:fixed;inset:0;background:rgba(8,23,42,.35);backdrop-filter:blur(2px);z-index:70;}
  .osf-dash-tray{position:fixed;top:0;right:0;bottom:0;width:290px;max-width:85vw;z-index:71;
    background:rgba(255,255,255,.92);backdrop-filter:blur(16px);border-left:1px solid var(--line);
    box-shadow:-24px 0 60px -30px rgba(10,26,47,.5);display:flex;flex-direction:column;padding:1.5rem 0;}
  .osf-dash-tray-header{display:flex;align-items:center;justify-content:space-between;padding:0 1.25rem 1.25rem;
    border-bottom:1px solid var(--line);margin-bottom:.5rem;}
  .osf-dash-tray-title{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
    font-size:15px;font-weight:700;}
  .osf-dash-tray-close{display:flex;align-items:center;justify-content:center;width:28px;height:28px;
    border-radius:7px;border:1px solid var(--line);background:none;color:var(--text-muted);cursor:pointer;
    transition:all .2s var(--ease);}
  .osf-dash-tray-close:hover{color:var(--danger);border-color:rgba(179,69,59,.4);}
  .osf-dash-tray-list{display:flex;flex-direction:column;padding:.5rem .75rem;gap:2px;flex:1;overflow-y:auto;}
  .osf-dash-tray-item{display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:9px;
    border:none;background:none;color:var(--text-body);font-size:13.5px;font-weight:500;cursor:pointer;
    text-align:left;font-family:inherit;transition:all .2s var(--ease);}
  .osf-dash-tray-item:hover{background:var(--accent-soft);color:var(--accent-strong);transform:translateX(3px);}
  .osf-dash-tray-item svg{flex-shrink:0;color:var(--navy-600,var(--navy-700));}
  .osf-dash-tray-item:hover svg{color:var(--accent-strong);}
  .osf-dash-tray-footer{padding:.75rem .75rem 0;border-top:1px solid var(--line);margin-top:.5rem;}
  .osf-dash-tray-signout{color:var(--danger);}
  .osf-dash-tray-signout svg{color:var(--danger);}
  .osf-dash-tray-signout:hover{background:rgba(179,69,59,.08);color:var(--danger);}

  .osf-dash-section-title{color:var(--text-muted);font-size:12px;font-weight:700;text-transform:uppercase;
    letter-spacing:.08em;margin:0 0 1rem;font-family:'IBM Plex Mono',monospace;}
  .osf-dash-err{color:var(--danger);font-size:14px;}
  .osf-dash-empty-box{background:rgba(255,255,255,.75);border:1px solid var(--line);border-radius:16px;
    padding:3rem 2rem;text-align:center;}
  .osf-dash-empty-title{color:var(--navy-950);font-size:16px;font-weight:600;margin:0 0 8px;
    font-family:'Space Grotesk','Inter',sans-serif;}
  .osf-dash-empty-sub{color:var(--text-muted);font-size:14px;margin:0 0 1.5rem;line-height:1.6;}

  .osf-dash-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:16px;}
  .osf-dash-card{background:rgba(255,255,255,.8);backdrop-filter:blur(6px);border:1px solid var(--line);
    border-radius:14px;padding:1.25rem;cursor:pointer;display:flex;flex-direction:column;gap:12px;
    transition:transform .3s var(--ease),box-shadow .3s var(--ease),border-color .3s var(--ease);}
  .osf-dash-card:hover{transform:translateY(-4px);border-color:rgba(199,149,65,.4);
    box-shadow:0 24px 44px -28px rgba(10,26,47,.4);}
  .osf-dash-card-top{display:flex;justify-content:space-between;align-items:center;}
  .osf-dash-card-date{color:var(--text-muted);font-size:12px;}
  .osf-dash-badge{font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.05em;white-space:nowrap;}
  .osf-dash-deal-row{position:relative;height:30px;background:var(--bg);border-radius:8px;overflow:hidden;
    display:flex;align-items:center;padding:0 10px;border:1px solid var(--line);}
  .osf-dash-deal-bar-fill{position:absolute;left:0;top:0;height:100%;opacity:.16;border-radius:8px;
    transition:width .4s ease;}
  .osf-dash-deal-text{font-size:13px;font-weight:600;position:relative;z-index:1;}
  .osf-dash-card-footer{color:var(--text-muted);font-size:12px;margin:0;display:flex;align-items:center;gap:4px;}

  .osf-dash-skel{height:11px;border-radius:4px;
    background:linear-gradient(90deg,var(--accent-soft) 25%,#FBF4E6 37%,var(--accent-soft) 63%);
    background-size:400% 100%;animation:osfDashShimmer 1.6s ease-in-out infinite;}
  @keyframes osfDashShimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}

  /* Welcome popup */
  .osf-dash-welcome-backdrop{position:fixed;inset:0;background:rgba(8,23,42,.55);backdrop-filter:blur(4px);
    z-index:90;display:flex;align-items:center;justify-content:center;padding:20px;}
  .osf-dash-welcome-card{position:relative;overflow:hidden;width:100%;max-width:420px;
    background:rgba(255,255,255,.95);backdrop-filter:blur(16px);border:1px solid var(--line);
    border-radius:22px;box-shadow:0 40px 90px -30px rgba(10,26,47,.6);}
  .osf-dash-welcome-aurora{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
  .osf-dash-welcome-blob{position:absolute;border-radius:50%;filter:blur(70px);opacity:.5;}
  .osf-dash-welcome-blob.a{width:280px;height:280px;top:-100px;right:-80px;
    background:radial-gradient(circle,rgba(199,149,65,.5),transparent 70%);}
  .osf-dash-welcome-blob.b{width:240px;height:240px;bottom:-100px;left:-80px;
    background:radial-gradient(circle,rgba(47,156,142,.35),transparent 70%);}
  .osf-dash-welcome-close{position:absolute;top:16px;right:16px;z-index:2;display:flex;align-items:center;
    justify-content:center;width:30px;height:30px;border-radius:8px;border:1px solid var(--line);
    background:rgba(255,255,255,.8);color:var(--text-muted);cursor:pointer;transition:all .2s var(--ease);}
  .osf-dash-welcome-close:hover{color:var(--navy-900);border-color:var(--line-strong);}
  .osf-dash-welcome-body{position:relative;z-index:1;padding:2.75rem 2.25rem 2.25rem;text-align:center;}
  .osf-dash-welcome-icon{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;
    border-radius:16px;background:linear-gradient(135deg,var(--accent-soft),#FBF3E3);color:var(--accent-strong);
    margin-bottom:1.1rem;}
  .osf-dash-welcome-body h2{font-family:'Space Grotesk','Inter',sans-serif;color:var(--navy-950);
    font-size:22px;font-weight:700;margin:0 0 10px;letter-spacing:-.02em;}
  .osf-dash-welcome-sub{color:var(--text-muted);font-size:14px;line-height:1.6;margin:0 0 1.5rem;}
  .osf-dash-welcome-trial{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;
    background:var(--accent-soft);border:1px solid rgba(199,149,65,.35);border-radius:12px;
    padding:10px 14px;margin-bottom:1.5rem;}
  .osf-dash-welcome-trial-badge{background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;
    font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:.03em;white-space:nowrap;}
  .osf-dash-welcome-trial-text{color:var(--accent-strong);font-size:12.5px;font-weight:600;}
  .osf-dash-welcome-cta{position:relative;overflow:hidden;width:100%;display:flex;align-items:center;
    justify-content:center;gap:8px;padding:13px;border-radius:10px;border:none;
    background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;font-weight:600;
    font-size:14.5px;font-family:inherit;cursor:pointer;
    box-shadow:0 16px 30px -18px rgba(10,26,47,.8);
    transition:transform .25s var(--ease),box-shadow .25s var(--ease);}
  .osf-dash-welcome-cta::after{content:"";position:absolute;top:0;left:0;width:45%;height:100%;
    background:linear-gradient(90deg,transparent,rgba(255,255,255,.25),transparent);
    transform:translateX(-140%) skewX(-18deg);}
  .osf-dash-welcome-cta:hover::after{transition:transform .8s var(--ease);transform:translateX(300%) skewX(-18deg);}
  .osf-dash-welcome-cta:hover{transform:translateY(-2px);box-shadow:0 22px 40px -18px rgba(10,26,47,.75);}
  .osf-dash-welcome-later{width:100%;padding:10px;margin-top:8px;background:none;border:none;
    color:var(--text-muted);font-size:13px;cursor:pointer;font-family:inherit;transition:color .2s var(--ease);}
  .osf-dash-welcome-later:hover{color:var(--navy-900);}

  @media (prefers-reduced-motion:reduce){
    .osf-dash-skel{animation:none;} .osf-dash-blob,.osf-dash-welcome-blob{display:none;}
  }
`
