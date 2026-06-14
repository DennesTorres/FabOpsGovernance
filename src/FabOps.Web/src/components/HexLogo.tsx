/** The FabOps brand mark (shared by the landing page, header and loading screen). */
export default function HexLogo({ id, size = 28 }: { id: string; size?: number }) {
  return (
    <svg viewBox="0 0 40 46" fill="none" width={size} height={size} style={{ flexShrink: 0 }}>
      <path d="M20 2L37 11.5V28.5L20 38 3 28.5V11.5L20 2Z"
        fill={`url(#${id})`} stroke="rgba(99,102,241,.35)" strokeWidth="1" />
      <path d="M13 22l4.5 4.5L27 17"
        stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id={id} x1="3" y1="2" x2="37" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  );
}
