import { useState, useEffect } from "react";
import { BarChart3, Radio, GraduationCap, ArrowRight, ChevronRight, Check } from "lucide-react";

export default function OsfSuiteLandingPage() {
  const [persona, setPersona] = useState("manager");
  const [dashboardReady, setDashboardReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDashboardReady(true), 1100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="osf">
      <style>{`
        .osf {
          --navy-950:#0A1A2F; --navy-800:#122B49; --navy-700:#1B3A5C; --navy-600:#2C5478; --navy-500:#4A7099;
          --bg:#FFFFFF; --bg-soft:#F7F6F3; --line:#E5E2DB; --line-strong:#D8D4C9;
          --text:#2B2A26; --text-body:#46443E; --text-muted:#8A8779;
          --accent:#B8863B; --accent-soft:#F6ECD9; --accent-strong:#8F6423;
          font-family:'Inter', 'Helvetica Neue', Arial, sans-serif;
          color:var(--text-body);
          background:var(--bg);
          line-height:1.55;
        }
        .osf *{box-sizing:border-box;}
        .osf h1,.osf h2,.osf h3{
          font-family:'Space Grotesk','Inter',sans-serif;
          color:var(--navy-950); margin:0; letter-spacing:-0.01em;
        }
        .osf .mono{font-family:'IBM Plex Mono',monospace;}
        .osf-wrap{max-width:1160px;margin:0 auto;padding:0 24px;}
        .osf section{padding:80px 0;}
        @media (max-width:720px){ .osf section{padding:52px 0;} .osf-wrap{padding:0 18px;} }

        .osf-eyebrow{
          font-family:'IBM Plex Mono',monospace;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;
          color:var(--accent-strong);display:flex;align-items:center;gap:10px;margin-bottom:14px;
        }
        .osf-eyebrow::before{content:"";width:14px;height:1px;background:var(--accent-strong);}

        .osf-btn{
          display:inline-flex;align-items:center;justify-content:center;gap:6px;
          font-weight:600;font-size:14.5px;padding:12px 20px;border-radius:7px;border:1px solid transparent;
          cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .1s ease;
        }
        .osf-btn:active{transform:translateY(1px);}
        .osf-btn-primary{background:var(--navy-950);color:#fff;}
        .osf-btn-primary:hover{background:var(--navy-800);}
        .osf-btn-ghost{background:transparent;color:var(--navy-950);border-color:var(--line-strong);}
        .osf-btn-ghost:hover{border-color:var(--navy-600);}

        /* header */
        .osf-header{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);}
        .osf-nav{display:flex;align-items:center;justify-content:space-between;padding:16px 0;}
        .osf-logo{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:19px;color:var(--navy-950);}
        .osf-logo span{color:var(--accent-strong);}
        .osf-nav-links{display:flex;gap:28px;align-items:center;}
        .osf-nav-links a{font-size:14px;font-weight:500;color:var(--text-body);text-decoration:none;}
        .osf-nav-links a:hover{color:var(--navy-950);}
        .osf-nav-actions{display:flex;align-items:center;gap:14px;}
        @media (max-width:760px){ .osf-nav-links{display:none;} }

        /* hero */
        .osf-hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;padding-top:16px;}
        @media (max-width:960px){ .osf-hero-grid{grid-template-columns:1fr;gap:40px;} }
        .osf-hero h1{font-size:clamp(30px,4vw,46px);line-height:1.1;font-weight:600;margin-bottom:18px;}
        .osf-hero .osf-lead{font-size:16.5px;color:var(--text-body);max-width:480px;margin-bottom:26px;}
        .osf-hero-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:28px;}
        .osf-stats-row{display:flex;gap:28px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:22px;}
        .osf-stat b{display:block;font-family:'Space Grotesk',sans-serif;font-size:22px;color:var(--navy-950);}
        .osf-stat span{font-size:12.5px;color:var(--text-muted);}

        /* hero call panel */
        .osf-call-panel{background:var(--navy-950);border-radius:16px;padding:20px;color:#fff;box-shadow:0 24px 60px -20px rgba(10,26,47,.45);}
        .osf-call-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,.12);}
        .osf-call-head .osf-rec{display:flex;align-items:center;gap:8px;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:#E8E2D2;}
        .osf-rec-dot{width:7px;height:7px;border-radius:50%;background:#E0645A;animation:osf-pulse 1.8s ease-in-out infinite;}
        @media (prefers-reduced-motion:reduce){.osf-rec-dot{animation:none;}}
        @keyframes osf-pulse{0%,100%{opacity:1;}50%{opacity:.35;}}
        .osf-call-head .osf-meta{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:#9FB0C4;}
        .osf-tline{margin-bottom:12px;}
        .osf-tline .osf-speaker{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#9FB0C4;margin-bottom:3px;display:block;}
        .osf-tline.client .osf-speaker{color:#E8C994;}
        .osf-tline p{margin:0;font-size:13.5px;color:#EDEAE1;}
        .osf-nudge{background:var(--accent-soft);border:1px solid #E4C98F;color:#5C3F14;border-radius:7px;padding:9px 11px;font-size:12.5px;margin:14px 0;display:flex;gap:7px;}
        .osf-nudge b{font-family:'IBM Plex Mono',monospace;font-size:10.5px;text-transform:uppercase;flex-shrink:0;}

        /* before/after */
        .osf-ba-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
        @media (max-width:760px){ .osf-ba-grid{grid-template-columns:1fr;} }
        .osf-ba-card{border-radius:12px;padding:22px;border:1px solid var(--line);}
        .osf-ba-card.osf-before{background:var(--bg-soft);}
        .osf-ba-card.osf-after{background:var(--navy-950);color:#fff;}
        .osf-ba-tag{font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;display:inline-block;}
        .osf-before .osf-ba-tag{color:var(--text-muted);}
        .osf-after .osf-ba-tag{color:#E8C994;}
        .osf-ba-row{display:flex;align-items:center;gap:10px;padding:8px 0;font-size:13.5px;border-bottom:1px dashed var(--line-strong);}
        .osf-after .osf-ba-row{border-bottom:1px dashed rgba(255,255,255,.14);color:#D9E0E9;}
        .osf-ba-row:last-child{border-bottom:none;}
        .osf-ba-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
        .osf-before .osf-ba-dot{background:#C24B3F;}
        .osf-after .osf-ba-dot{background:#7FBF8E;}
        .osf-pill{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:20px;}

        /* pillars */
        .osf-pillar-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
        @media (max-width:860px){ .osf-pillar-grid{grid-template-columns:1fr;} }
        .osf-pillar{border:1px solid var(--line);border-radius:12px;padding:26px;background:#fff;}
        .osf-pillar-icon{width:38px;height:38px;border-radius:9px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;color:var(--accent-strong);margin-bottom:16px;}
        .osf-pillar h3{font-size:16.5px;font-weight:600;margin-bottom:8px;}
        .osf-pillar p{font-size:13.5px;color:var(--text-muted);margin:0 0 14px;}
        .osf-pillar-tag{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--navy-600);text-transform:uppercase;}

        /* skeleton demo inside pillar */
        .osf-skel{height:9px;border-radius:4px;margin-bottom:7px;background:linear-gradient(90deg,#EDEAE1 25%,#F7F3E9 37%,#EDEAE1 63%);background-size:400% 100%;animation:osf-shimmer 1.6s ease-in-out infinite;}
        @media (prefers-reduced-motion:reduce){.osf-skel{animation:none;}}
        @keyframes osf-shimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}
        .osf-bar-row{display:flex;align-items:flex-end;gap:6px;height:44px;margin-top:6px;}
        .osf-bar{flex:1;background:var(--navy-600);border-radius:3px 3px 0 0;transition:height .5s ease;}

        /* persona toggle */
        .osf-toggle{display:inline-flex;border:1px solid var(--line-strong);border-radius:8px;padding:3px;margin-bottom:28px;}
        .osf-toggle button{border:none;background:transparent;padding:9px 18px;font-size:13.5px;font-weight:600;border-radius:6px;cursor:pointer;color:var(--text-muted);}
        .osf-toggle button.active{background:var(--navy-950);color:#fff;}
        .osf-persona-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;}
        @media (max-width:760px){ .osf-persona-grid{grid-template-columns:1fr;} }
        .osf-persona-list{list-style:none;margin:0;padding:0;}
        .osf-persona-list li{display:flex;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);font-size:14px;}
        .osf-persona-list li:first-child{border-top:1px solid var(--line);}
        .osf-check{width:16px;height:16px;border-radius:4px;background:var(--accent-soft);color:var(--accent-strong);flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:2px;}

        /* proof */
        .osf-proof-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:36px;}
        @media (max-width:760px){ .osf-proof-strip{grid-template-columns:1fr;} }
        .osf-proof-card{border:1px solid var(--line);border-radius:12px;padding:22px;text-align:center;background:var(--bg-soft);}
        .osf-proof-card b{display:block;font-family:'Space Grotesk',sans-serif;font-size:28px;color:var(--navy-950);margin-bottom:4px;}
        .osf-proof-card span{font-size:13px;color:var(--text-muted);}
        .osf-proof-note{font-size:12px;color:var(--text-muted);text-align:center;margin-top:-20px;margin-bottom:36px;}

        /* final CTA */
        .osf-final-cta{background:var(--navy-950);border-radius:18px;padding:52px 40px;text-align:center;color:#fff;}
        @media (max-width:720px){ .osf-final-cta{padding:36px 22px;} }
        .osf-final-cta h2{color:#fff;font-size:clamp(24px,3vw,32px);margin-bottom:12px;}
        .osf-final-cta p{color:#B9C4D2;font-size:15px;margin:0 0 26px;}
        .osf-final-actions{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;}
        .osf-final-actions .osf-btn-ghost{color:#fff;border-color:rgba(255,255,255,.3);}
        .osf-final-actions .osf-btn-ghost:hover{border-color:#fff;}

        /* footer */
        .osf-footer{border-top:1px solid var(--line);padding:52px 0 28px;background:var(--bg-soft);}
        .osf-footer-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:36px;padding-bottom:36px;}
        @media (max-width:680px){ .osf-footer-grid{grid-template-columns:1fr 1fr;} }
        @media (max-width:460px){ .osf-footer-grid{grid-template-columns:1fr;} }
        .osf-footer p{font-size:13.5px;color:var(--text-muted);margin:0 0 12px;max-width:260px;}
        .osf-footer h4{font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--navy-700);margin-bottom:14px;}
        .osf-footer ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;}
        .osf-footer a{font-size:13.5px;color:var(--text-body);text-decoration:none;}
        .osf-footer a:hover{color:var(--navy-950);}
        .osf-footer-bottom{border-top:1px solid var(--line);padding-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
        .osf-footer-bottom p{font-size:12px;color:var(--text-muted);margin:0;}
        .osf-footer-legal{display:flex;gap:18px;flex-wrap:wrap;}
        .osf-footer-legal a{font-size:12px;color:var(--text-muted);}
      `}</style>

      {/* HEADER */}
      <header className="osf-header">
        <div className="osf-wrap osf-nav">
          <div className="osf-logo">OSF<span>-Suite</span></div>
          <nav className="osf-nav-links">
            <a href="#workflow">Product</a>
            <a href="#personas">Who it's for</a>
          </nav>
          <div className="osf-nav-actions">
            <a href="/login" className="osf-btn osf-btn-ghost">Log in</a>
            <a href="/signup" className="osf-btn osf-btn-primary">Get started</a>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="osf-hero">
          <div className="osf-wrap osf-hero-grid">
            <div>
              <div className="osf-eyebrow">Conversation intelligence</div>
              <h1>Close deals faster with real-time in-call AI guidance.</h1>
              <p className="osf-lead">
                OSF-Suite analyzes sales calls live, surfaces objection cards on the fly,
                and automates coaching for the whole team, grounded in what you actually sell.
              </p>
              <div className="osf-hero-actions">
                <a href="/signup" className="osf-btn osf-btn-primary">
                  Get started <ArrowRight size={15} />
                </a>
                <a href="#workflow" className="osf-btn osf-btn-ghost">See how it works</a>
              </div>
              <div className="osf-stats-row">
                <div className="osf-stat"><b>22%</b><span>higher win rate</span></div>
                <div className="osf-stat"><b>2x</b><span>faster rep ramp-up</span></div>
                <div className="osf-stat"><b>Live</b><span>during the call, not after</span></div>
              </div>
            </div>

            <div className="osf-call-panel">
              <div className="osf-call-head">
                <div className="osf-rec"><span className="osf-rec-dot" />LIVE CALL</div>
                <div className="osf-meta">rep_04 · in progress</div>
              </div>
              <div className="osf-tline">
                <span className="osf-speaker">Rep</span>
                <p>So the rollout would happen in two phases, starting with your team...</p>
              </div>
              <div className="osf-tline client">
                <span className="osf-speaker">Client</span>
                <p>Timeline works. I'd still need to check budget with finance first.</p>
              </div>
              <div className="osf-nudge"><b>Nudge</b> Budget not confirmed. Ask who signs off.</div>
              <div className="osf-tline">
                <span className="osf-speaker">Rep</span>
                <p>Understood, who else would be involved in that decision?</p>
              </div>
            </div>
          </div>
        </section>

        {/* BEFORE / AFTER + PILLARS combined as "workflow" */}
        <section id="workflow" className="osf">
          <div className="osf-wrap">
            <div style={{ maxWidth: 620, marginBottom: 36 }}>
              <div className="osf-eyebrow">Before OSF-Suite, after OSF-Suite</div>
              <h2 style={{ fontSize: "clamp(24px,3vw,32px)", fontWeight: 600, lineHeight: 1.2 }}>
                From missed signals to a coaching plan, automatically.
              </h2>
            </div>

            <div className="osf-ba-grid" style={{ marginBottom: 56 }}>
              <div className="osf-ba-card osf-before">
                <span className="osf-ba-tag">Without OSF-Suite</span>
                <div className="osf-ba-row"><span className="osf-ba-dot" />Objections get missed mid-call</div>
                <div className="osf-ba-row"><span className="osf-ba-dot" />Coaching happens weeks later, from memory</div>
                <div className="osf-ba-row"><span className="osf-ba-dot" />Deals go cold before anyone notices</div>
                <div className="osf-ba-row"><span className="osf-ba-dot" />A rep's instincts leave when they do</div>
              </div>
              <div className="osf-ba-card osf-after">
                <span className="osf-ba-tag">With OSF-Suite</span>
                <div className="osf-ba-row"><span className="osf-ba-dot" />Objection cards surface during the call</div>
                <div className="osf-ba-row"><span className="osf-ba-dot" />A coaching report lands minutes after it ends</div>
                <div className="osf-ba-row"><span className="osf-ba-dot" />Deal health is flagged the moment it slips</div>
                <div className="osf-ba-row"><span className="osf-ba-dot" />Every technique is captured for the whole team</div>
              </div>
            </div>

            <div className="osf-pillar-grid">
              <div className="osf-pillar">
                <div className="osf-pillar-icon"><BarChart3 size={18} /></div>
                <span className="osf-pillar-tag">For managers</span>
                <h3>Post-call analysis</h3>
                <p>Talk ratios, lost-deal signals, and objection handling, broken down call by call.</p>
                <div className="osf-bar-row">
                  {[38, 62, 45, 80, 30].map((h, i) => (
                    <div
                      key={i}
                      className="osf-bar"
                      style={{ height: dashboardReady ? `${h}%` : "12%" }}
                    />
                  ))}
                </div>
              </div>

              <div className="osf-pillar">
                <div className="osf-pillar-icon"><Radio size={18} /></div>
                <span className="osf-pillar-tag">For reps</span>
                <h3>Live guidance</h3>
                <p>Real-time prompts pushed to reps the moment an objection or buying signal appears.</p>
                {!dashboardReady ? (
                  <>
                    <div className="osf-skel" style={{ width: "88%" }} />
                    <div className="osf-skel" style={{ width: "64%" }} />
                  </>
                ) : (
                  <div className="osf-nudge" style={{ background: "var(--accent-soft)", color: "var(--accent-strong)", border: "1px solid #E4C98F" }}>
                    <b>Live</b> Client just mentioned a Q3 deadline
                  </div>
                )}
              </div>

              <div className="osf-pillar">
                <div className="osf-pillar-icon"><GraduationCap size={18} /></div>
                <span className="osf-pillar-tag">For teams</span>
                <h3>Automated coaching</h3>
                <p>Manager-ready views that pinpoint each rep's skill gaps and what to fix this week.</p>
                {!dashboardReady ? (
                  <>
                    <div className="osf-skel" style={{ width: "80%" }} />
                    <div className="osf-skel" style={{ width: "55%" }} />
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--navy-700)", fontWeight: 500 }}>
                    3 reps flagged for talk-ratio coaching this week
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* DUAL PERSONA */}
        <section id="personas" style={{ background: "var(--bg-soft)" }}>
          <div className="osf-wrap">
            <div className="osf-eyebrow">Built for the whole team</div>
            <h2 style={{ fontSize: "clamp(24px,3vw,32px)", fontWeight: 600, marginBottom: 24 }}>
              Different roles, the same source of truth.
            </h2>

            <div className="osf-toggle">
              <button
                className={persona === "manager" ? "active" : ""}
                onClick={() => setPersona("manager")}
              >
                Sales managers
              </button>
              <button
                className={persona === "rep" ? "active" : ""}
                onClick={() => setPersona("rep")}
              >
                Sales reps
              </button>
            </div>

            <div className="osf-persona-grid">
              <div>
                <h3 style={{ fontSize: 18, marginBottom: 12 }}>
                  {persona === "manager" ? "What managers get" : "What reps get"}
                </h3>
                <ul className="osf-persona-list">
                  {(persona === "manager"
                    ? [
                        "Team-wide deal health and coaching scores, without sitting in on every call",
                        "Weekly coaching plans built from each rep's actual gaps, not guesswork",
                        "A shared library of what your top performers do differently",
                      ]
                    : [
                        "Live nudges during the call, right when an objection or signal appears",
                        "A ready-to-use script for the exact objection you just faced",
                        "A full report within minutes of hanging up, no note-taking required",
                      ]
                  ).map((t, i) => (
                    <li key={i}>
                      <span className="osf-check"><Check size={10} strokeWidth={3} /></span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="osf-ba-card osf-after" style={{ height: "100%" }}>
                  <span className="osf-ba-tag">
                    {persona === "manager" ? "Manager view" : "Rep view"}
                  </span>
                  {persona === "manager" ? (
                    <>
                      <div className="osf-ba-row">rep_01 &nbsp;·&nbsp; <span className="osf-pill" style={{ background: "#F7E9E7", color: "#B3453B" }}>HOT</span></div>
                      <div className="osf-ba-row">rep_02 &nbsp;·&nbsp; talk ratio flagged</div>
                      <div className="osf-ba-row">rep_03 &nbsp;·&nbsp; <span className="osf-pill" style={{ background: "#F6ECD9", color: "#8F6423" }}>WARM</span></div>
                      <div className="osf-ba-row">rep_04 &nbsp;·&nbsp; <span className="osf-pill" style={{ background: "#EAF0F5", color: "#2C5478" }}>COLD</span></div>
                    </>
                  ) : (
                    <>
                      <div className="osf-ba-row"><span className="osf-ba-dot" />Objection handled well: pricing</div>
                      <div className="osf-ba-row"><span className="osf-ba-dot" />Missed: confirm decision maker</div>
                      <div className="osf-ba-row"><span className="osf-ba-dot" />Next call script ready</div>
                      <div className="osf-ba-row"><span className="osf-ba-dot" />This week's focus: discovery questions</div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROOF */}
        <section id="proof">
          <div className="osf-wrap">
            <div className="osf-eyebrow">Results teams are seeing</div>
            <h2 style={{ fontSize: "clamp(24px,3vw,32px)", fontWeight: 600, marginBottom: 32 }}>
              Numbers, not generic praise.
            </h2>
            <div className="osf-proof-strip">
              <div className="osf-proof-card"><b>22%</b><span>increase in win rate</span></div>
              <div className="osf-proof-card"><b>50%</b><span>cut in new rep ramp time</span></div>
              <div className="osf-proof-card"><b>3 min</b><span>from call end to coaching report</span></div>
            </div>
            <p className="osf-proof-note">Illustrative figures based on early pilot teams. Replace with your own once you have production data.</p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section>
          <div className="osf-wrap">
            <div className="osf-final-cta">
              <h2>See it live on your own calls.</h2>
              <p>Get started in minutes, no lengthy setup required.</p>
              <div className="osf-final-actions">
                <a href="/signup" className="osf-btn osf-btn-primary" style={{ background: "var(--accent)", color: "#231803" }}>
                  Get started <ChevronRight size={15} />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="osf-footer">
        <div className="osf-wrap">
          <div className="osf-footer-grid">
            <div>
              <div className="osf-logo" style={{ marginBottom: 10 }}>OSF<span>-Suite</span></div>
              <p>AI-powered sales coaching and revenue intelligence, live during the call and automatic after it.</p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li><a href="#workflow">How it works</a></li>
                <li><a href="#personas">Who it's for</a></li>
                <li><a href="/login">Log in</a></li>
                <li><a href="/signup">Sign up</a></li>
              </ul>
            </div>
            <div>
              <h4>Company</h4>
              <ul>
                <li><a href="mailto:akinfeadesanmit@gmail.com">akinfeadesanmit@gmail.com</a></li>
                <li><a href="tel:+2348120697429">+234 812 069 7429</a></li>
                <li style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Lagos, Nigeria</li>
              </ul>
            </div>
          </div>
          <div className="osf-footer-bottom">
            <p>© 2026 OSF-Suite. All rights reserved. Lagos, Nigeria.</p>
            <div className="osf-footer-legal">
              <a href="/pricing">Pricing</a>
              <a href="/terms">Terms of Use</a>
              <a href="/privacy">Privacy Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
