import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import OsfLogoMark from "./OsfLogoMark";

/**
 * Shared chrome for long-form legal documents (Privacy Policy, Terms of Use).
 * Reuses the navy/gold design language from the auth pages but swaps the
 * tilting card for a plain, readable document layout — nobody wants a
 * pointer-tilt effect while trying to read a liability clause.
 */
export default function LegalLayout({ title, updated, effective, children, otherDocHref, otherDocLabel }) {
  return (
    <div className="osf-legal">
      <style>{`
        .osf-legal{
          --navy-950:#08172A; --navy-900:#0A1A2F; --navy-700:#1B3A5C;
          --bg:#FCFBF9; --line:#E5E2DB; --line-strong:#D8D4C9;
          --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
          --accent:#C79541; --accent-strong:#8F6423; --teal:#2F9C8E;
          --ease:cubic-bezier(.22,.61,.36,1);
          min-height:100dvh; background:var(--bg); color:var(--text-body);
          font-family:'Inter','Helvetica Neue',Arial,sans-serif;
        }
        .osf-legal *{box-sizing:border-box;}
        .osf-legal-header{
          position:sticky; top:0; z-index:10; background:rgba(252,251,249,.88);
          backdrop-filter:blur(10px); border-bottom:1px solid var(--line);
        }
        .osf-legal-header-inner{
          max-width:820px; margin:0 auto; padding:16px 24px;
          display:flex; align-items:center; justify-content:space-between; gap:16px;
        }
        .osf-legal-logo{height:26px; width:auto; display:block;}
        .osf-legal-back{
          display:inline-flex; align-items:center; gap:6px; color:var(--text-muted);
          font-size:13.5px; font-weight:500; text-decoration:none;
          transition:color .2s var(--ease);
        }
        .osf-legal-back:hover{color:var(--navy-900);}
        .osf-legal-main{max-width:820px; margin:0 auto; padding:48px 24px 96px;}
        .osf-legal-eyebrow{
          color:var(--accent-strong); font-size:12.5px; font-weight:700;
          letter-spacing:.06em; text-transform:uppercase; margin:0 0 10px;
        }
        .osf-legal h1{
          font-family:'Space Grotesk','Inter',sans-serif; color:var(--navy-950);
          font-size:clamp(28px,4vw,38px); letter-spacing:-.02em; margin:0 0 10px;
        }
        .osf-legal-meta{
          display:flex; flex-wrap:wrap; gap:8px 18px; font-size:13px;
          color:var(--text-muted); margin:0 0 28px;
        }
        .osf-legal-meta strong{color:var(--text-body); font-weight:600;}
        .osf-legal-notice{
          background:rgba(199,149,65,.08); border:1px solid rgba(199,149,65,.28);
          border-radius:12px; padding:14px 16px; font-size:13.5px; line-height:1.6;
          color:var(--text-body); margin:0 0 36px;
        }
        .osf-legal-notice strong{color:var(--accent-strong);}
        .osf-legal-body h2{
          font-family:'Space Grotesk','Inter',sans-serif; color:var(--navy-950);
          font-size:20px; letter-spacing:-.01em; margin:40px 0 12px;
          padding-top:8px; scroll-margin-top:80px;
        }
        .osf-legal-body h2:first-child{margin-top:0;}
        .osf-legal-body h3{
          color:var(--navy-700); font-size:15.5px; font-weight:700;
          margin:22px 0 8px; scroll-margin-top:80px;
        }
        .osf-legal-body p{font-size:14.5px; line-height:1.75; margin:0 0 14px; color:var(--text-body);}
        .osf-legal-body ul, .osf-legal-body ol{
          margin:0 0 14px; padding-left:22px; font-size:14.5px; line-height:1.75; color:var(--text-body);
        }
        .osf-legal-body li{margin-bottom:6px;}
        .osf-legal-body strong{color:var(--text); font-weight:700;}
        .osf-legal-body a{color:var(--accent-strong); text-decoration:underline; text-underline-offset:2px;}
        .osf-legal-hr{border:none; border-top:1px solid var(--line); margin:32px 0;}
        .osf-legal-footer{
          margin-top:56px; padding-top:24px; border-top:1px solid var(--line);
          display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between;
        }
        .osf-legal-footer-text{font-size:13px; color:var(--text-muted);}
        .osf-legal-footer-link{
          display:inline-flex; align-items:center; gap:6px; font-size:13.5px; font-weight:600;
          color:var(--navy-900); text-decoration:none; padding:9px 14px; border-radius:9px;
          border:1px solid var(--line-strong); transition:border-color .2s var(--ease), background .2s var(--ease);
        }
        .osf-legal-footer-link:hover{border-color:var(--accent); background:rgba(199,149,65,.06);}
      `}</style>

      <header className="osf-legal-header">
        <div className="osf-legal-header-inner">
          <Link to="/" aria-label="OSF-Suite home">
            <OsfLogoMark className="osf-legal-logo" />
          </Link>
          <Link to="/signup" className="osf-legal-back">
            <ArrowLeft size={14} />
            Back to signup
          </Link>
        </div>
      </header>

      <main className="osf-legal-main">
        <p className="osf-legal-eyebrow">Legal</p>
        <h1>{title}</h1>
        <div className="osf-legal-meta">
          {updated && <span><strong>Last updated:</strong> {updated}</span>}
          {effective && <span><strong>Effective:</strong> {effective}</span>}
        </div>

        <div className="osf-legal-body">{children}</div>

        {otherDocHref && (
          <div className="osf-legal-footer">
            <span className="osf-legal-footer-text">Looking for the other document?</span>
            <Link to={otherDocHref} className="osf-legal-footer-link">
              {otherDocLabel}
              <ArrowLeft size={13} style={{ transform: "rotate(180deg)" }} />
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
