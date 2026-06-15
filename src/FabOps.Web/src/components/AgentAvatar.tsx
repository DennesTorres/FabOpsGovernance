/** A friendly sun avatar (original SVG) used to give the Malta Beaches guide a face. */
export default function AgentAvatar({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="Malta Beaches guide">
      <defs>
        <linearGradient id="agent-av" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      {/* sky/sea disc */}
      <circle cx="32" cy="32" r="32" fill="url(#agent-av)" />
      {/* sun */}
      <circle cx="32" cy="27" r="11" fill="#fde68a" />
      <circle cx="32" cy="27" r="11" fill="none" stroke="#f59e0b" strokeWidth="2" />
      {/* friendly face */}
      <circle cx="28" cy="26" r="1.6" fill="#92400e" />
      <circle cx="36" cy="26" r="1.6" fill="#92400e" />
      <path d="M28 30c1.4 1.6 6.6 1.6 8 0" stroke="#92400e" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      {/* waves */}
      <path d="M10 46c3 0 3 2.4 6 2.4s3-2.4 6-2.4 3 2.4 6 2.4 3-2.4 6-2.4 3 2.4 6 2.4 3-2.4 6-2.4"
        stroke="#eff9ff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M10 53c3 0 3 2.4 6 2.4s3-2.4 6-2.4 3 2.4 6 2.4 3-2.4 6-2.4 3 2.4 6 2.4 3-2.4 6-2.4"
        stroke="#eff9ff" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}
