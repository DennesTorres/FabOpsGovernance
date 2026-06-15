/** The end user's avatar — deliberately distinct from the agent's (slate, plain person, no headset). */
export default function UserAvatar({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="You">
      <defs>
        <linearGradient id="user-av" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#475569" />
          <stop offset="1" stopColor="#334155" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill="url(#user-av)" />
      {/* head */}
      <circle cx="32" cy="25" r="11" fill="#e2e8f0" />
      {/* shoulders */}
      <path d="M14 53c0-10 9-15 18-15s18 5 18 15" fill="#e2e8f0" />
    </svg>
  );
}
