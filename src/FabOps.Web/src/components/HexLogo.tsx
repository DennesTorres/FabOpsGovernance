/** The Malta Beaches brand mark — a sun rising over the sea (shared by landing, header, loading). */
export default function HexLogo({ id, size = 28 }: { id: string; size?: number }) {
  return (
    <svg viewBox="0 0 40 46" fill="none" width={size} height={size} style={{ flexShrink: 0 }}>
      <path d="M20 2L37 11.5V28.5L20 38 3 28.5V11.5L20 2Z"
        fill={`url(#${id})`} stroke="rgba(8,145,178,.35)" strokeWidth="1" />
      {/* sun */}
      <circle cx="20" cy="18" r="5" fill="#fff" />
      {/* waves */}
      <path d="M9 26c2 0 2 1.6 4 1.6S15 26 17 26s2 1.6 4 1.6S23 26 25 26s2 1.6 4 1.6"
        stroke="#fff" strokeWidth="1.8" strokeLinecap="round" fill="none" opacity=".95" />
      <defs>
        <linearGradient id={id} x1="3" y1="2" x2="37" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#06b6d4" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  );
}
