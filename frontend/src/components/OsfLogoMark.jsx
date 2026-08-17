import { useId } from "react";

/**
 * Inline SVG logo, shared across every page that shows it. Deliberately
 * not an <img src="/logo-mark.png"> — a missing/misconfigured static
 * asset can't break this, because the vector ships inside the JS bundle
 * itself. useId() keeps gradient ids unique per mount, since more than
 * one instance of this can exist on the same page (e.g. header + footer).
 */
export default function OsfLogoMark({ className, style }) {
  const uid = useId();
  const bubbleFillId = `osfBubbleFill-${uid}`;
  const tickStrokeId = `osfTickStroke-${uid}`;

  return (
    <svg viewBox="0 0 220 48" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-label="OSF-Suite">
      <defs>
        <linearGradient id={bubbleFillId} x1="4" y1="4" x2="42" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#122B49" />
          <stop offset="100%" stopColor="#08172A" />
        </linearGradient>
        <linearGradient id={tickStrokeId} x1="10" y1="26" x2="32" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8F6423" />
          <stop offset="100%" stopColor="#E7BC6B" />
        </linearGradient>
      </defs>
      <g>
        <path d="M13 30 L8.5 39 L20 30.5 Z" fill={`url(#${bubbleFillId})`} />
        <rect x="4" y="5" width="36" height="27" rx="11" fill={`url(#${bubbleFillId})`} />
        <polyline
          points="11,23 17,17.5 21.5,20.5 30,10"
          fill="none"
          stroke={`url(#${tickStrokeId})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="30" cy="10" r="2.8" fill="#2F9C8E" />
      </g>
      <text x="54" y="32" fontFamily="'Space Grotesk','Helvetica Neue',Arial,sans-serif"
        fontSize="25" fontWeight="700" letterSpacing="-0.5" fill="#0A1A2F">OSF</text>
      <rect x="114" y="21.5" width="12" height="3.5" rx="1.75" fill="#8F6423" />
      <text x="132" y="32" fontFamily="'Space Grotesk','Helvetica Neue',Arial,sans-serif"
        fontSize="25" fontWeight="500" letterSpacing="-0.5" fill="#8F6423">Suite</text>
    </svg>
  );
}