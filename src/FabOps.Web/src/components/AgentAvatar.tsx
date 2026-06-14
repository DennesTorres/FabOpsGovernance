/** A friendly support-agent avatar (original SVG) used to give the FabOps agent a face. */
export default function AgentAvatar({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="FabOps Copilot">
      <defs>
        <linearGradient id="agent-av" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#agent-av)" />
      {/* shoulders */}
      <path d="M15 53c0-9 8-14 17-14s17 5 17 14" fill="#eef2ff" />
      {/* head */}
      <circle cx="32" cy="26" r="12" fill="#f8fafc" />
      {/* eyes */}
      <circle cx="27.5" cy="25" r="1.8" fill="#1a2845" />
      <circle cx="36.5" cy="25" r="1.8" fill="#1a2845" />
      {/* smile */}
      <path d="M27 29.5c1.6 2.2 8.4 2.2 10 0" stroke="#1a2845" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* headset band + ear pads */}
      <path d="M20 26a12 12 0 0 1 24 0" stroke="#6366f1" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <rect x="17.5" y="25" width="5" height="8" rx="2.5" fill="#6366f1" />
      <rect x="41.5" y="25" width="5" height="8" rx="2.5" fill="#6366f1" />
      {/* mic boom */}
      <path d="M44 31c2.5 4.5-1 8.5-5 9" stroke="#6366f1" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="38" cy="40.5" r="1.9" fill="#22d3ee" />
    </svg>
  );
}
