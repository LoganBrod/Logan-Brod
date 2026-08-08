/** The hook and shoulders a garment hangs from. Purely decorative. */
export default function Hanger({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 30"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* hook over the rail */}
      <path d="M32 10c0-3 2.6-5 5.2-4.2 2 .6 3 2.4 2.6 4.2" />
      {/* shoulders */}
      <path d="M32 10 6 24.5h52L32 10Z" />
    </svg>
  );
}
