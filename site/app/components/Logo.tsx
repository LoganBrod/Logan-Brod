/**
 * The mark, and the name beside it.
 *
 * The same two paths as `app/icon.svg`, so the browser tab and the header are
 * one shape rather than two drawings of a hanger that drifted apart. Stroked
 * in `currentColor` instead of the favicon's fixed accent: in the tab it is
 * composited against chrome we don't control, but on the page it should take
 * the colour of whatever it sits in.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* The hook, and the neck down to the shoulder point. */}
      <path d="M13.9 10.3a2.1 2.1 0 1 1 2.1 2.1v1.6" />
      {/* The bar, with both shoulders running down to it. */}
      <path d="M16 14 6 22.5h20L16 14Z" />
    </svg>
  );
}

/**
 * The mark and the company name, as one object.
 *
 * Uppercase with open tracking, which is what turns a name set in the body
 * face into a wordmark - the display face at this size would be read as a
 * heading, and a heading in the corner of a header is a heading nobody wanted.
 */
export function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  const big = size === "lg";
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className={`${big ? "h-9 w-9" : "h-7 w-7"} shrink-0 text-accent`} />
      <span
        className={`font-semibold uppercase tracking-[0.18em] text-room-ink ${
          big ? "text-[14px] sm:text-[15px]" : "text-[11px] sm:text-[13px]"
        }`}
      >
        LevoZ Labs
      </span>
    </span>
  );
}
