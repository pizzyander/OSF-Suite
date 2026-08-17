import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import OsfLogoMark from '../components/OsfLogoMark'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import {
  BarChart3,
  Radio,
  GraduationCap,
  ArrowRight,
  ChevronRight,
  Check,
  GripVertical,
  Sparkles,
} from "lucide-react";

/** Adds .is-in when the element scrolls into view. */
function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    el.querySelectorAll(".osf-reveal").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
  return ref;
}

/** Cursor-magnetic wrapper for CTAs. */
function Magnetic({ children, strength = 14 }) {
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.4 });
  if (reduce) return <>{children}</>;
  return (
    <motion.span
      style={{ x, y, display: "inline-flex" }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set(((e.clientX - (r.left + r.width / 2)) / r.width) * strength * 2);
        y.set(((e.clientY - (r.top + r.height / 2)) / r.height) * strength * 2);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

/** Counts a numeric value up when it scrolls into view. */
function CountUp({ value, suffix = "", prefix = "" }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const [n, setN] = useState(value);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      io.disconnect();
      animate(0, value, {
        duration: 1.4,
        ease: [0.22, 0.61, 0.36, 1],
        onUpdate: (v) => setN(v),
      });
    };
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, value]);
  return (
    <span ref={ref}>
      {prefix}
      {Number.isInteger(value) ? Math.round(n) : n.toFixed(1)}
      {suffix}
    </span>
  );
}

const TICKER = [
  "Live objection cards",
  "Talk-ratio analytics",
  "Deal-health signals",
  "Auto coaching plans",
  "CRM-ready summaries",
  "Rep skill scoring",
];

export default function OsfSuiteLandingPage() {
  const [persona, setPersona] = useState("manager");
  const [dashboardReady, setDashboardReady] = useState(false);
  const [split, setSplit] = useState(52);
  const [dragging, setDragging] = useState(false);
  const rootRef = useReveal();
  const compareRef = useRef(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.3 });

  // 3D tilt for the live-call panel
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotX = useSpring(useTransform(py, [-0.5, 0.5], [8, -8]), { stiffness: 180, damping: 20 });
  const rotY = useSpring(useTransform(px, [-0.5, 0.5], [-10, 10]), { stiffness: 180, damping: 20 });

  useEffect(() => {
    const t = setTimeout(() => setDashboardReady(true), 1100);
    return () => clearTimeout(t);
  }, []);

  const moveSplit = useCallback((clientX) => {
    const box = compareRef.current?.getBoundingClientRect();
    if (!box) return;
    const pct = ((clientX - box.left) / box.width) * 100;
    setSplit(Math.min(92, Math.max(8, pct)));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => moveSplit(e.clientX);
    const stop = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [dragging, moveSplit]);

  const tiltStyle = { "--split": `${split}%` };

  const headline = "Close deals faster with real-time in-call AI guidance.".split(" ");

  return (
    <div className="osf" ref={rootRef}>
      <style>{`
        .osf {
          --navy-950:#08172A; --navy-900:#0A1A2F; --navy-800:#122B49; --navy-700:#1B3A5C; --navy-600:#2C5478; --navy-500:#4A7099;
          --bg:#FCFBF9; --bg-soft:#F5F3EE; --line:#E5E2DB; --line-strong:#D8D4C9;
          --text:#211F1C; --text-body:#46443E; --text-muted:#8A8779;
          --accent:#C79541; --accent-soft:#F6ECD9; --accent-strong:#8F6423; --teal:#2F9C8E;
          --ease:cubic-bezier(.22,.61,.36,1);
          --glass:rgba(255,255,255,.72);
          font-family:'Inter','Helvetica Neue',Arial,sans-serif;
          color:var(--text-body); background:var(--bg); line-height:1.55;
          position:relative; overflow-x:hidden;
        }
        .osf *{box-sizing:border-box;}
        .osf h1,.osf h2,.osf h3{
          font-family:'Space Grotesk','Inter',sans-serif;
          color:var(--navy-950); margin:0; letter-spacing:-0.02em;
        }
        .osf-wrap{max-width:1180px;margin:0 auto;padding:0 24px;position:relative;}
        .osf section{padding:92px 0;position:relative;}
        @media (max-width:720px){ .osf section{padding:56px 0;} .osf-wrap{padding:0 18px;} }

        .osf-aurora{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;}
        .osf-blob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.5;}
        .osf-blob.a{width:520px;height:520px;top:-180px;right:-120px;background:radial-gradient(circle,rgba(199,149,65,.45),transparent 70%);}
        .osf-blob.b{width:460px;height:460px;top:120px;left:-180px;background:radial-gradient(circle,rgba(47,156,142,.32),transparent 70%);}
        .osf-blob.c{width:380px;height:380px;bottom:-140px;left:38%;background:radial-gradient(circle,rgba(28,58,92,.28),transparent 70%);}
        .osf-grain{position:absolute;inset:0;pointer-events:none;z-index:0;opacity:.35;mix-blend-mode:multiply;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='.28'/%3E%3C/svg%3E");}
        .osf main, .osf-header, .osf-footer{position:relative;z-index:1;}

        .osf-progress{position:fixed;top:0;left:0;right:0;height:2px;transform-origin:0 50%;z-index:80;
          background:linear-gradient(90deg,var(--navy-800),var(--accent),var(--teal));}

        .osf-reveal{opacity:0;transform:translateY(22px);filter:blur(6px);transition:opacity .8s var(--ease),transform .8s var(--ease),filter .8s var(--ease);}
        .osf-reveal.is-in{opacity:1;transform:none;filter:none;}
        .osf-reveal[data-d="1"]{transition-delay:.08s;}
        .osf-reveal[data-d="2"]{transition-delay:.16s;}
        .osf-reveal[data-d="3"]{transition-delay:.24s;}
        @media (prefers-reduced-motion:reduce){
          .osf-reveal{opacity:1;transform:none;filter:none;transition:none;}
          .osf-blob{display:none;}
        }

        .osf-eyebrow{
          font-family:'IBM Plex Mono',monospace;font-size:11.5px;letter-spacing:0.14em;text-transform:uppercase;
          color:var(--accent-strong);display:inline-flex;align-items:center;gap:10px;margin-bottom:16px;
          padding:5px 12px 5px 10px;border-radius:99px;border:1px solid rgba(199,149,65,.35);
          background:linear-gradient(120deg,rgba(246,236,217,.9),rgba(255,255,255,.4));
          backdrop-filter:blur(6px);
        }
        .osf-eyebrow::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent);
          box-shadow:0 0 0 0 rgba(199,149,65,.55);animation:osf-pulse 2.4s ease-in-out infinite;}

        .osf-grad{
          background:linear-gradient(100deg,var(--navy-950) 10%,var(--accent-strong) 45%,var(--teal) 80%);
          -webkit-background-clip:text;background-clip:text;color:transparent;
          background-size:220% 100%;animation:osf-sheen 7s var(--ease) infinite;
        }
        @keyframes osf-sheen{0%,100%{background-position:0% 0;}50%{background-position:100% 0;}}

        .osf-btn{
          position:relative;overflow:hidden;isolation:isolate;
          display:inline-flex;align-items:center;justify-content:center;gap:7px;
          font-weight:600;font-size:14.5px;padding:13px 22px;border-radius:10px;border:1px solid transparent;
          text-decoration:none;cursor:pointer;letter-spacing:-0.01em;
          transition:background .25s var(--ease),border-color .25s var(--ease),transform .25s var(--ease),box-shadow .35s var(--ease),color .2s var(--ease);
        }
        .osf-btn svg{transition:transform .25s var(--ease);}
        .osf-btn:hover svg{transform:translateX(3px);}
        .osf-btn::after{
          content:"";position:absolute;inset:0;z-index:-1;transform:translateX(-120%) skewX(-18deg);
          background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);
        }
        .osf-btn:hover::after{transition:transform .8s var(--ease);transform:translateX(120%) skewX(-18deg);}
        .osf-btn:active{transform:translateY(1px) scale(.985);}
        .osf-btn-primary{background:linear-gradient(135deg,var(--navy-900),var(--navy-700));color:#fff;
          box-shadow:0 10px 24px -14px rgba(10,26,47,.8),inset 0 1px 0 rgba(255,255,255,.14);}
        .osf-btn-primary:hover{transform:translateY(-2px);box-shadow:0 20px 40px -16px rgba(10,26,47,.6),0 0 0 4px rgba(199,149,65,.16);}
        .osf-btn-ghost{background:var(--glass);color:var(--navy-950);border-color:var(--line-strong);backdrop-filter:blur(8px);}
        .osf-btn-ghost:hover{border-color:var(--navy-600);transform:translateY(-2px);box-shadow:0 14px 30px -20px rgba(10,26,47,.6);}
        .osf-btn-gold{background:linear-gradient(135deg,#E7BC6B,var(--accent));color:#231803;
          box-shadow:0 14px 34px -14px rgba(199,149,65,.75);}
        .osf-btn-gold:hover{transform:translateY(-2px);box-shadow:0 22px 48px -16px rgba(199,149,65,.85);}

        .osf-header{position:sticky;top:0;z-index:50;background:rgba(252,251,249,.72);backdrop-filter:blur(14px) saturate(140%);border-bottom:1px solid var(--line);}
        .osf-nav{display:flex;align-items:center;justify-content:space-between;padding:15px 0;}
        .osf-logo-img{height:30px;width:auto;display:block;}
        .osf-nav-links{display:flex;gap:28px;align-items:center;}
        .osf-nav-links a{position:relative;font-size:14px;font-weight:500;color:var(--text-body);text-decoration:none;transition:color .2s var(--ease);}
        .osf-nav-links a::after{content:"";position:absolute;left:0;bottom:-5px;height:1.5px;width:100%;background:linear-gradient(90deg,var(--accent),var(--teal));transform:scaleX(0);transform-origin:right;transition:transform .35s var(--ease);}
        .osf-nav-links a:hover{color:var(--navy-950);}
        .osf-nav-links a:hover::after{transform:scaleX(1);transform-origin:left;}
        .osf-nav-actions{display:flex;align-items:center;gap:12px;}
        @media (max-width:760px){ .osf-nav-links{display:none;} .osf-nav-actions .osf-btn-ghost{display:none;} }

        .osf-hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;padding-top:12px;}
        @media (max-width:960px){ .osf-hero-grid{grid-template-columns:1fr;gap:40px;} }
        .osf-hero h1{font-size:clamp(32px,4.6vw,54px);line-height:1.05;font-weight:600;margin-bottom:20px;}
        .osf-word{display:inline-block;margin-right:.28em;}
        .osf-hero .osf-lead{font-size:16.5px;color:var(--text-body);max-width:500px;margin-bottom:28px;}
        .osf-hero-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:30px;}
        .osf-stats-row{display:flex;gap:14px;flex-wrap:wrap;}
        .osf-stat{flex:1;min-width:126px;padding:14px 16px;border-radius:14px;border:1px solid var(--line);
          background:var(--glass);backdrop-filter:blur(8px);
          transition:transform .35s var(--ease),box-shadow .35s var(--ease),border-color .35s var(--ease);}
        .osf-stat:hover{transform:translateY(-4px);border-color:rgba(199,149,65,.5);box-shadow:0 18px 34px -24px rgba(10,26,47,.6);}
        .osf-stat b{display:block;font-family:'Space Grotesk',sans-serif;font-size:24px;color:var(--navy-950);}
        .osf-stat span{font-size:12.5px;color:var(--text-muted);}

        .osf-ticker{border-block:1px solid var(--line);background:rgba(255,255,255,.5);overflow:hidden;padding:14px 0;
          mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);}
        .osf-ticker-track{display:flex;gap:44px;width:max-content;animation:osf-marquee 26s linear infinite;}
        .osf-ticker:hover .osf-ticker-track{animation-play-state:paused;}
        @keyframes osf-marquee{to{transform:translateX(-50%);}}
        .osf-ticker-item{display:inline-flex;align-items:center;gap:8px;font-family:'IBM Plex Mono',monospace;
          font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--navy-600);white-space:nowrap;}
        .osf-ticker-item svg{color:var(--accent);}
        @media (prefers-reduced-motion:reduce){ .osf-ticker-track{animation:none;} }

        .osf-call-shell{perspective:1100px;}
        .osf-call-panel{
          background:linear-gradient(160deg,#0C2038,var(--navy-950) 60%);border-radius:20px;padding:22px;color:#fff;
          box-shadow:0 34px 80px -28px rgba(10,26,47,.6),inset 0 1px 0 rgba(255,255,255,.08);
          border:1px solid rgba(255,255,255,.08);position:relative;overflow:hidden;
          transform-style:preserve-3d;
        }
        .osf-call-panel::before{content:"";position:absolute;inset:-1px;border-radius:20px;pointer-events:none;
          background:conic-gradient(from 0deg,transparent,rgba(199,149,65,.5),transparent 32%);
          -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000);
          -webkit-mask-composite:xor;mask-composite:exclude;padding:1px;animation:osf-spin 9s linear infinite;}
        .osf-call-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,.12);}
        .osf-call-head .osf-rec{display:flex;align-items:center;gap:8px;font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:#E8E2D2;}
        .osf-rec-dot{width:7px;height:7px;border-radius:50%;background:#E0645A;box-shadow:0 0 0 0 rgba(224,100,90,.6);animation:osf-pulse 1.8s ease-in-out infinite;}
        @keyframes osf-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(224,100,90,.5);}50%{opacity:.45;box-shadow:0 0 0 7px rgba(224,100,90,0);}}
        .osf-call-head .osf-meta{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:#9FB0C4;}
        .osf-tline{margin-bottom:12px;opacity:0;animation:osf-line-in .6s var(--ease) forwards;}
        .osf-tline:nth-of-type(1){animation-delay:.15s;}
        .osf-tline:nth-of-type(2){animation-delay:.55s;}
        .osf-tline:nth-of-type(3){animation-delay:1.35s;}
        @keyframes osf-line-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
        .osf-tline .osf-speaker{font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#9FB0C4;margin-bottom:3px;display:block;}
        .osf-tline.client .osf-speaker{color:#E8C994;}
        .osf-tline p{margin:0;font-size:13.5px;color:#EDEAE1;}
        .osf-nudge{background:linear-gradient(135deg,var(--accent-soft),#FBF4E6);border:1px solid #E4C98F;color:#5C3F14;border-radius:9px;padding:10px 12px;font-size:12.5px;margin:14px 0;display:flex;gap:8px;
          box-shadow:0 12px 26px -18px rgba(199,149,65,.9);
          opacity:0;animation:osf-nudge-in .55s var(--ease) .95s forwards;}
        @keyframes osf-nudge-in{from{opacity:0;transform:translateX(-12px) scale(.96);}to{opacity:1;transform:none;}}
        .osf-nudge b{font-family:'IBM Plex Mono',monospace;font-size:10.5px;text-transform:uppercase;flex-shrink:0;}

        @media (prefers-reduced-motion:reduce){
          .osf-rec-dot,.osf-tline,.osf-nudge,.osf-skel,.osf-call-panel::before{animation:none !important;opacity:1 !important;}
        }

        .osf-compare{
          position:relative;border-radius:18px;overflow:hidden;border:1px solid var(--line);
          background:var(--bg-soft);touch-action:none;user-select:none;cursor:ew-resize;
          box-shadow:0 30px 70px -46px rgba(10,26,47,.7);
        }
        .osf-compare-layer{padding:30px;}
        .osf-compare-after{
          position:absolute;inset:0;background:linear-gradient(160deg,#0C2038,var(--navy-950));color:#fff;
          clip-path:inset(0 0 0 var(--split));
          transition:clip-path .18s var(--ease);
        }
        .osf-compare.is-dragging .osf-compare-after{transition:none;}
        .osf-compare-inner{width:100%;}
        .osf-handle{
          position:absolute;top:0;bottom:0;left:var(--split);width:2px;
          background:linear-gradient(180deg,transparent,var(--accent) 12%,var(--accent) 88%,transparent);
          transform:translateX(-1px);cursor:ew-resize;z-index:3;transition:left .18s var(--ease);
          box-shadow:0 0 22px rgba(199,149,65,.55);
        }
        .osf-compare.is-dragging .osf-handle{transition:none;}
        .osf-handle-grip{
          position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
          width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#EFCA82,var(--accent));color:#231803;
          display:flex;align-items:center;justify-content:center;
          box-shadow:0 12px 28px -8px rgba(10,26,47,.6),0 0 0 6px rgba(199,149,65,.16);
          transition:transform .3s var(--ease),box-shadow .3s var(--ease);
        }
        .osf-handle:hover .osf-handle-grip{transform:translate(-50%,-50%) scale(1.14);box-shadow:0 12px 28px -8px rgba(10,26,47,.6),0 0 0 12px rgba(199,149,65,.14);}
        .osf-compare.is-dragging .osf-handle-grip{transform:translate(-50%,-50%) scale(.92);}
        .osf-drag-hint{
          position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:4;
          font-family:'IBM Plex Mono',monospace;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
          background:rgba(255,255,255,.92);color:var(--navy-700);border:1px solid var(--line-strong);
          border-radius:20px;padding:5px 13px;pointer-events:none;backdrop-filter:blur(6px);
          animation:osf-float 2.4s ease-in-out infinite;
        }
        .osf-compare.is-dragging .osf-drag-hint{opacity:0;transition:opacity .2s;}
        @keyframes osf-float{0%,100%{transform:translateX(-50%) translateY(0);}50%{transform:translateX(-50%) translateY(-5px);}}
        .osf-ba-tag{font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.09em;margin-bottom:14px;display:inline-block;}
        .osf-before .osf-ba-tag{color:var(--text-muted);}
        .osf-after .osf-ba-tag{color:#E8C994;}
        .osf-ba-row{display:flex;align-items:center;gap:10px;padding:9px 0;font-size:13.5px;border-bottom:1px dashed var(--line-strong);white-space:nowrap;}
        .osf-after .osf-ba-row{border-bottom:1px dashed rgba(255,255,255,.14);color:#D9E0E9;}
        .osf-ba-row:last-child{border-bottom:none;}
        .osf-ba-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
        .osf-before .osf-ba-dot{background:#C24B3F;}
        .osf-after .osf-ba-dot{background:#7FBF8E;box-shadow:0 0 10px rgba(127,191,142,.7);}
        .osf-ba-card{border-radius:16px;padding:24px;border:1px solid var(--line);transition:transform .35s var(--ease),box-shadow .35s var(--ease);}
        .osf-ba-card.osf-after{background:linear-gradient(160deg,#0C2038,var(--navy-950));color:#fff;border-color:rgba(255,255,255,.08);}
        .osf-pill{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:20px;}

        .osf-pillar-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
        @media (max-width:860px){ .osf-pillar-grid{grid-template-columns:1fr;} }
        .osf-pillar{
          position:relative;border:1px solid var(--line);border-radius:16px;padding:28px;
          background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,255,255,.7));
          backdrop-filter:blur(8px);overflow:hidden;
          transition:transform .45s var(--ease),box-shadow .45s var(--ease),border-color .45s var(--ease);
        }
        .osf-pillar::before{
          content:"";position:absolute;inset:0;opacity:0;pointer-events:none;
          background:radial-gradient(460px circle at var(--mx,50%) var(--my,0%),rgba(199,149,65,.16),transparent 62%);
          transition:opacity .45s var(--ease);
        }
        .osf-pillar::after{
          content:"";position:absolute;inset:0;border-radius:16px;pointer-events:none;opacity:0;
          border:1px solid transparent;
          background:radial-gradient(320px circle at var(--mx,50%) var(--my,0%),rgba(199,149,65,.65),transparent 60%) border-box;
          -webkit-mask:linear-gradient(#000,#000) padding-box,linear-gradient(#000,#000);
          -webkit-mask-composite:xor;mask-composite:exclude;
          transition:opacity .45s var(--ease);
        }
        .osf-pillar:hover{transform:translateY(-8px);box-shadow:0 34px 60px -34px rgba(10,26,47,.5);}
        .osf-pillar:hover::before,.osf-pillar:hover::after{opacity:1;}
        .osf-pillar-icon{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--accent-soft),#FBF3E3);display:flex;align-items:center;justify-content:center;color:var(--accent-strong);margin-bottom:16px;transition:transform .45s var(--ease),box-shadow .45s var(--ease);}
        .osf-pillar:hover .osf-pillar-icon{transform:translateY(-3px) rotate(-8deg) scale(1.08);box-shadow:0 14px 28px -14px rgba(199,149,65,.9);}
        .osf-pillar h3{font-size:17px;font-weight:600;margin-bottom:8px;}
        .osf-pillar p{font-size:13.5px;color:var(--text-muted);margin:0 0 14px;}
        .osf-pillar-tag{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--navy-600);text-transform:uppercase;letter-spacing:.08em;}

        .osf-skel{height:9px;border-radius:4px;margin-bottom:7px;background:linear-gradient(90deg,#EDEAE1 25%,#F9F5EC 37%,#EDEAE1 63%);background-size:400% 100%;animation:osf-shimmer 1.6s ease-in-out infinite;}
        @keyframes osf-shimmer{0%{background-position:100% 0;}100%{background-position:0 0;}}
        @keyframes osf-spin{to{transform:rotate(360deg);}}
        .osf-bar-row{display:flex;align-items:flex-end;gap:6px;height:46px;margin-top:6px;}
        .osf-bar{flex:1;background:linear-gradient(180deg,var(--navy-600),var(--navy-800));border-radius:4px 4px 0 0;transition:height .8s var(--ease),background .35s var(--ease);}
        .osf-pillar:hover .osf-bar{background:linear-gradient(180deg,#E7BC6B,var(--accent));}

        .osf-toggle{position:relative;display:inline-flex;border:1px solid var(--line-strong);border-radius:12px;padding:4px;margin-bottom:30px;background:var(--glass);backdrop-filter:blur(8px);}
        .osf-toggle::before{
          content:"";position:absolute;top:4px;bottom:4px;left:4px;width:calc(50% - 4px);
          border-radius:9px;background:linear-gradient(135deg,var(--navy-900),var(--navy-700));
          box-shadow:0 10px 22px -14px rgba(10,26,47,.9);
          transition:transform .45s var(--ease);
        }
        .osf-toggle[data-p="rep"]::before{transform:translateX(100%);}
        .osf-toggle button{position:relative;z-index:1;flex:1;border:none;background:transparent;padding:10px 20px;font-size:13.5px;font-weight:600;border-radius:9px;cursor:pointer;color:var(--text-muted);transition:color .3s var(--ease);white-space:nowrap;}
        .osf-toggle button.active{color:#fff;}
        .osf-persona-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px;}
        @media (max-width:760px){ .osf-persona-grid{grid-template-columns:1fr;} }
        .osf-persona-list{list-style:none;margin:0;padding:0;}
        .osf-persona-list li{display:flex;gap:10px;padding:13px 0;border-bottom:1px solid var(--line);font-size:14px;
          animation:osf-line-in .45s var(--ease) both;transition:padding-left .3s var(--ease),color .3s var(--ease);}
        .osf-persona-list li:hover{padding-left:8px;color:var(--navy-950);}
        .osf-persona-list li:first-child{border-top:1px solid var(--line);}
        .osf-check{width:18px;height:18px;border-radius:6px;background:linear-gradient(135deg,var(--accent-soft),#FBF3E3);color:var(--accent-strong);flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:2px;transition:transform .3s var(--ease);}
        .osf-persona-list li:hover .osf-check{transform:scale(1.18) rotate(-10deg);}
        .osf-persona-panel{animation:osf-panel-in .5s var(--ease);}
        @keyframes osf-panel-in{from{opacity:0;transform:translateY(12px) scale(.99);}to{opacity:1;transform:none;}}

        .osf-proof-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:36px;}
        @media (max-width:760px){ .osf-proof-strip{grid-template-columns:1fr;} }
        .osf-proof-card{position:relative;border:1px solid var(--line);border-radius:16px;padding:26px;text-align:center;
          background:linear-gradient(180deg,rgba(255,255,255,.9),rgba(245,243,238,.7));overflow:hidden;
          transition:transform .4s var(--ease),box-shadow .4s var(--ease),border-color .4s var(--ease);}
        .osf-proof-card::before{content:"";position:absolute;inset:auto -20% -60% -20%;height:120%;
          background:radial-gradient(circle at 50% 100%,rgba(199,149,65,.22),transparent 70%);opacity:0;transition:opacity .4s var(--ease);}
        .osf-proof-card:hover{transform:translateY(-6px);border-color:rgba(199,149,65,.45);box-shadow:0 28px 52px -30px rgba(10,26,47,.5);}
        .osf-proof-card:hover::before{opacity:1;}
        .osf-proof-card b{position:relative;display:block;font-family:'Space Grotesk',sans-serif;font-size:34px;color:var(--navy-950);margin-bottom:4px;transition:color .3s var(--ease);letter-spacing:-.03em;}
        .osf-proof-card:hover b{color:var(--accent-strong);}
        .osf-proof-card span{position:relative;font-size:13px;color:var(--text-muted);}
        .osf-proof-note{font-size:12px;color:var(--text-muted);text-align:center;margin-top:-20px;margin-bottom:36px;}

        .osf-final-cta{position:relative;overflow:hidden;background:linear-gradient(150deg,#0C2038,var(--navy-950));border-radius:24px;padding:60px 40px;text-align:center;color:#fff;
          box-shadow:0 40px 90px -44px rgba(10,26,47,.9);}
        .osf-final-cta::before{content:"";position:absolute;inset:-40%;background:conic-gradient(from 0deg,transparent,rgba(199,149,65,.22),transparent 40%);animation:osf-spin 14s linear infinite;}
        .osf-final-cta::after{content:"";position:absolute;inset:0;opacity:.5;
          background:radial-gradient(600px circle at 50% 0%,rgba(47,156,142,.22),transparent 70%);}
        @media (prefers-reduced-motion:reduce){.osf-final-cta::before{animation:none;}}
        .osf-final-cta > *{position:relative;z-index:1;}
        @media (max-width:720px){ .osf-final-cta{padding:40px 22px;} }
        .osf-final-cta h2{color:#fff;font-size:clamp(26px,3.4vw,38px);margin-bottom:12px;}
        .osf-final-cta p{color:#B9C4D2;font-size:15px;margin:0 0 28px;}
        .osf-final-actions{display:flex;justify-content:center;gap:16px;flex-wrap:wrap;}

        .osf-footer{border-top:1px solid var(--line);padding:56px 0 28px;background:var(--bg-soft);}
        .osf-footer-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:36px;padding-bottom:36px;}
        @media (max-width:680px){ .osf-footer-grid{grid-template-columns:1fr 1fr;} }
        @media (max-width:460px){ .osf-footer-grid{grid-template-columns:1fr;} }
        .osf-footer p{font-size:13.5px;color:var(--text-muted);margin:0 0 12px;max-width:260px;}
        .osf-footer h4{font-family:'IBM Plex Mono',monospace;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--navy-700);margin-bottom:14px;}
        .osf-footer ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;}
        .osf-footer a{font-size:13.5px;color:var(--text-body);text-decoration:none;transition:color .2s var(--ease),transform .2s var(--ease);display:inline-block;}
        .osf-footer a:hover{color:var(--navy-950);transform:translateX(4px);}
        .osf-footer-bottom{border-top:1px solid var(--line);padding-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;}
        .osf-footer-bottom p{font-size:12px;color:var(--text-muted);margin:0;}
        .osf-footer-legal{display:flex;gap:18px;flex-wrap:wrap;}
        .osf-footer-legal a{font-size:12px;color:var(--text-muted);}
      `}</style>

      <motion.div className="osf-progress" style={{ scaleX: progress }} aria-hidden />

      <div className="osf-aurora" aria-hidden>
        <motion.span
          className="osf-blob a"
          animate={reduce ? undefined : { x: [0, -40, 10, 0], y: [0, 30, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="osf-blob b"
          animate={reduce ? undefined : { x: [0, 50, -20, 0], y: [0, -30, 25, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="osf-blob c"
          animate={reduce ? undefined : { x: [0, -30, 40, 0], y: [0, 20, -25, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <div className="osf-grain" aria-hidden />

      <header className="osf-header">
        <div className="osf-wrap osf-nav">
          <OsfLogoMark className="osf-logo-img" />
          <nav className="osf-nav-links">
            <a href="#workflow">Product</a>
            <a href="#personas">Who it's for</a>
            <a href="#proof">Results</a>
          </nav>
          <div className="osf-nav-actions">
            <Link to="/login" className="osf-btn osf-btn-ghost">
              Log in
            </Link>
            <Magnetic strength={8}>
              <Link to="/signup" className="osf-btn osf-btn-primary">
                Get started
              </Link>
            </Magnetic>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="osf-hero">
          <div className="osf-wrap osf-hero-grid">
            <div>
              <motion.div
                className="osf-eyebrow"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              >
                Conversation intelligence
              </motion.div>
              <h1>
                {headline.map((w, i) => (
                  <motion.span
                    key={`${w}-${i}`}
                    className={`osf-word${i >= 5 ? " osf-grad" : ""}`}
                    initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 0.7, delay: 0.06 * i, ease: [0.22, 0.61, 0.36, 1] }}
                  >
                    {w}
                  </motion.span>
                ))}
              </h1>
              <motion.p
                className="osf-lead"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.5 }}
              >
                OSF-Suite analyzes sales calls live, surfaces objection cards on the fly, and
                automates coaching for the whole team, grounded in what you actually sell.
              </motion.p>
              <motion.div
                className="osf-hero-actions"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.62 }}
              >
                <Magnetic>
                  <Link to="/signup" className="osf-btn osf-btn-primary">
                    Get started <ArrowRight size={15} />
                  </Link>
                </Magnetic>
                <a href="#workflow" className="osf-btn osf-btn-ghost">
                  See how it works
                </a>
              </motion.div>
              <motion.div
                className="osf-stats-row"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.74 }}
              >
                <div className="osf-stat">
                  <b>
                    <CountUp value={22} suffix="%" />
                  </b>
                  <span>higher win rate</span>
                </div>
                <div className="osf-stat">
                  <b>2x</b>
                  <span>faster rep ramp-up</span>
                </div>
                <div className="osf-stat">
                  <b>Live</b>
                  <span>during the call, not after</span>
                </div>
              </motion.div>
            </div>

            <motion.div
              className="osf-call-shell"
              initial={{ opacity: 0, y: 26, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
              onPointerMove={(e) => {
                if (reduce) return;
                const r = e.currentTarget.getBoundingClientRect();
                px.set((e.clientX - r.left) / r.width - 0.5);
                py.set((e.clientY - r.top) / r.height - 0.5);
              }}
              onPointerLeave={() => {
                px.set(0);
                py.set(0);
              }}
            >
              <motion.div
                className="osf-call-panel"
                style={reduce ? undefined : { rotateX: rotX, rotateY: rotY }}
              >
                <div className="osf-call-head">
                  <div className="osf-rec">
                    <span className="osf-rec-dot" />
                    LIVE CALL
                  </div>
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
                <div className="osf-nudge">
                  <b>Nudge</b> Budget not confirmed. Ask who signs off.
                </div>
                <div className="osf-tline">
                  <span className="osf-speaker">Rep</span>
                  <p>Understood, who else would be involved in that decision?</p>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* TICKER */}
        <div className="osf-ticker">
          <div className="osf-ticker-track">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span className="osf-ticker-item" key={`${t}-${i}`}>
                <Sparkles size={12} />
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* WORKFLOW */}
        <section id="workflow" style={{ background: "var(--bg-soft)" }}>
          <div className="osf-wrap">
            <div className="osf-reveal" style={{ maxWidth: 640, marginBottom: 36 }}>
              <div className="osf-eyebrow">Before OSF-Suite, after OSF-Suite</div>
              <h2 style={{ fontSize: "clamp(26px,3.4vw,38px)", fontWeight: 600, lineHeight: 1.15 }}>
                From missed signals to a coaching plan, automatically.
              </h2>
            </div>

            <div className="osf-reveal" style={{ marginBottom: 56 }}>
              <div
                ref={compareRef}
                className={`osf-compare${dragging ? " is-dragging" : ""}`}
                style={tiltStyle}
                onPointerDown={(e) => {
                  setDragging(true);
                  moveSplit(e.clientX);
                }}
              >
                <div className="osf-compare-layer osf-before">
                  <span className="osf-ba-tag">Without OSF-Suite</span>
                  <div className="osf-ba-row">
                    <span className="osf-ba-dot" />
                    Objections get missed mid-call
                  </div>
                  <div className="osf-ba-row">
                    <span className="osf-ba-dot" />
                    Coaching happens weeks later, from memory
                  </div>
                  <div className="osf-ba-row">
                    <span className="osf-ba-dot" />
                    Deals go cold before anyone notices
                  </div>
                  <div className="osf-ba-row">
                    <span className="osf-ba-dot" />
                    A rep's instincts leave when they do
                  </div>
                </div>

                <div className="osf-compare-after osf-after">
                  <div className="osf-compare-layer">
                    <span className="osf-ba-tag">With OSF-Suite</span>
                    <div className="osf-ba-row">
                      <span className="osf-ba-dot" />
                      Objection cards surface during the call
                    </div>
                    <div className="osf-ba-row">
                      <span className="osf-ba-dot" />
                      A coaching report lands minutes after it ends
                    </div>
                    <div className="osf-ba-row">
                      <span className="osf-ba-dot" />
                      Deal health is flagged the moment it slips
                    </div>
                    <div className="osf-ba-row">
                      <span className="osf-ba-dot" />
                      Every technique is captured for the whole team
                    </div>
                  </div>
                </div>

                <div
                  className="osf-handle"
                  role="slider"
                  tabIndex={0}
                  aria-label="Drag to compare before and after OSF-Suite"
                  aria-valuemin={8}
                  aria-valuemax={92}
                  aria-valuenow={Math.round(split)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") setSplit((s) => Math.max(8, s - 4));
                    if (e.key === "ArrowRight") setSplit((s) => Math.min(92, s + 4));
                  }}
                >
                  <span className="osf-handle-grip">
                    <GripVertical size={16} />
                  </span>
                </div>
                <span className="osf-drag-hint">Drag to compare</span>
              </div>
            </div>

            <div className="osf-pillar-grid">
              {[
                {
                  icon: <BarChart3 size={18} />,
                  tag: "For managers",
                  title: "Post-call analysis",
                  copy: "Talk ratios, lost-deal signals, and objection handling, broken down call by call.",
                  body: (
                    <div className="osf-bar-row">
                      {[38, 62, 45, 80, 30].map((h, i) => (
                        <div
                          key={i}
                          className="osf-bar"
                          style={{
                            height: dashboardReady ? `${h}%` : "12%",
                            transitionDelay: `${i * 70}ms`,
                          }}
                        />
                      ))}
                    </div>
                  ),
                },
                {
                  icon: <Radio size={18} />,
                  tag: "For reps",
                  title: "Live guidance",
                  copy: "Real-time prompts pushed to reps the moment an objection or buying signal appears.",
                  body: !dashboardReady ? (
                    <>
                      <div className="osf-skel" style={{ width: "88%" }} />
                      <div className="osf-skel" style={{ width: "64%" }} />
                    </>
                  ) : (
                    <div className="osf-nudge" style={{ animationDelay: "0s" }}>
                      <b>Live</b> Client just mentioned a Q3 deadline
                    </div>
                  ),
                },
                {
                  icon: <GraduationCap size={18} />,
                  tag: "For teams",
                  title: "Automated coaching",
                  copy: "Manager-ready views that pinpoint each rep's skill gaps and what to fix this week.",
                  body: !dashboardReady ? (
                    <>
                      <div className="osf-skel" style={{ width: "80%" }} />
                      <div className="osf-skel" style={{ width: "55%" }} />
                    </>
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--navy-700)", fontWeight: 500 }}>
                      3 reps flagged for talk-ratio coaching this week
                    </p>
                  ),
                },
              ].map((p, i) => (
                <div
                  key={p.title}
                  className="osf-pillar osf-reveal"
                  data-d={i + 1}
                  onPointerMove={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
                    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
                  }}
                >
                  <div className="osf-pillar-icon">{p.icon}</div>
                  <span className="osf-pillar-tag">{p.tag}</span>
                  <h3>{p.title}</h3>
                  <p>{p.copy}</p>
                  {p.body}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PERSONAS */}
        <section id="personas" style={{ background: "rgba(245,243,238,.7)" }}>
          <div className="osf-wrap">
            <div className="osf-reveal">
              <div className="osf-eyebrow">Built for the whole team</div>
              <h2 style={{ fontSize: "clamp(26px,3.4vw,38px)", fontWeight: 600, marginBottom: 24 }}>
                Different roles, the same source of truth.
              </h2>

              <div className="osf-toggle" data-p={persona}>
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
            </div>

            <div className="osf-persona-grid osf-reveal">
              <div key={persona} className="osf-persona-panel">
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
                    <li key={t} style={{ animationDelay: `${i * 80}ms` }}>
                      <span className="osf-check">
                        <Check size={10} strokeWidth={3} />
                      </span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div
                  key={`${persona}-panel`}
                  className="osf-ba-card osf-after osf-persona-panel"
                  style={{ height: "100%" }}
                >
                  <span className="osf-ba-tag">
                    {persona === "manager" ? "Manager view" : "Rep view"}
                  </span>
                  {persona === "manager" ? (
                    <>
                      <div className="osf-ba-row">
                        rep_01 &nbsp;·&nbsp;{" "}
                        <span className="osf-pill" style={{ background: "#F7E9E7", color: "#B3453B" }}>
                          HOT
                        </span>
                      </div>
                      <div className="osf-ba-row">rep_02 &nbsp;·&nbsp; talk ratio flagged</div>
                      <div className="osf-ba-row">
                        rep_03 &nbsp;·&nbsp;{" "}
                        <span className="osf-pill" style={{ background: "#F6ECD9", color: "#8F6423" }}>
                          WARM
                        </span>
                      </div>
                      <div className="osf-ba-row">
                        rep_04 &nbsp;·&nbsp;{" "}
                        <span className="osf-pill" style={{ background: "#EAF0F5", color: "#2C5478" }}>
                          COLD
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="osf-ba-row">
                        <span className="osf-ba-dot" />
                        Objection handled well: pricing
                      </div>
                      <div className="osf-ba-row">
                        <span className="osf-ba-dot" />
                        Missed: confirm decision maker
                      </div>
                      <div className="osf-ba-row">
                        <span className="osf-ba-dot" />
                        Next call script ready
                      </div>
                      <div className="osf-ba-row">
                        <span className="osf-ba-dot" />
                        This week's focus: discovery questions
                      </div>
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
            <div className="osf-reveal">
              <div className="osf-eyebrow">Results teams are seeing</div>
              <h2 style={{ fontSize: "clamp(26px,3.4vw,38px)", fontWeight: 600, marginBottom: 32 }}>
                Numbers, not generic praise.
              </h2>
            </div>
            <div className="osf-proof-strip">
              {[
                { value: 22, suffix: "%", label: "increase in win rate" },
                { value: 50, suffix: "%", label: "cut in new rep ramp time" },
                { value: 3, suffix: " min", label: "from call end to coaching report" },
              ].map((s, i) => (
                <div key={s.label} className="osf-proof-card osf-reveal" data-d={i + 1}>
                  <b>
                    <CountUp value={s.value} suffix={s.suffix} />
                  </b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
            <p className="osf-proof-note">
              Illustrative figures based on early pilot teams. Replace with your own once you have
              production data.
            </p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section>
          <div className="osf-wrap">
            <div className="osf-final-cta osf-reveal">
              <h2>See it live on your own calls.</h2>
              <p>Get started in minutes, no lengthy setup required.</p>
              <div className="osf-final-actions">
                <Magnetic>
                  <Link to="/signup" className="osf-btn osf-btn-gold">
                    Get started <ChevronRight size={15} />
                  </Link>
                </Magnetic>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="osf-footer">
        <div className="osf-wrap">
          <div className="osf-footer-grid">
            <div>
              <OsfLogoMark className="osf-logo-img" style={{ marginBottom: 12 }} />
              <p>
                AI-powered sales coaching and revenue intelligence, live during the call and
                automatic after it.
              </p>
            </div>
            <div>
              <h4>Product</h4>
              <ul>
                <li>
                  <a href="#workflow">How it works</a>
                </li>
                <li>
                  <a href="#personas">Who it's for</a>
                </li>
                <li>
                  <Link to="/login">Log in</Link>
                </li>
                <li>
                  <Link to="/signup">Sign up</Link>
                </li>
              </ul>
            </div>
            <div>
              <h4>Company</h4>
              <ul>
                <li>
                  <a href="mailto:info@hygini.app">info@hygini.app</a>
                </li>
                <li>
                  <a href="tel:+2348120697429">+234 812 069 7429</a>
                </li>
                <li style={{ color: "var(--text-muted)", fontSize: 13.5 }}>Lagos, Nigeria</li>
              </ul>
            </div>
          </div>
          <div className="osf-footer-bottom">
            <p>© 2026 OSF-Suite. All rights reserved. Lagos, Nigeria.</p>
            <div className="osf-footer-legal">
              <Link to="/pricing">Pricing</Link>
              <a href="/terms">Terms of Use</a>
              <a href="/privacy">Privacy Policy</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
