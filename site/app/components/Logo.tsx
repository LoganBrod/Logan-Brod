/**
 * The mark, and the name beside it.
 *
 * The same drawing as `app/icon.svg`, so the browser tab and the header are one
 * shape rather than two that drift apart. It replaces a stroked coat hanger:
 * the hanger described the product and never described the company, and every
 * page of the site is now run by LevoZ Labs rather than by Clozet alone.
 *
 * Unlike the hanger, this one does **not** take `currentColor`. It is a plate
 * with its own ground, and that is deliberate rather than lazy: the brand's
 * teal is #33D6C3, which against this site's off-white page is about 1.6:1 and
 * illegible. On its own dark tile it is 8:1 and it is the brand. So the colour
 * lives inside the tile and the name beside it is set in page ink, which is
 * also what keeps the site to one accent instead of two.
 *
 * The geometry is checked at 16, 24 and 40. The letters are drawn as paths, not
 * set in a face — a favicon cannot wait for a webfont, and at 16px a light
 * weight closes up anyway, which is why these strokes are as heavy as they are.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="LevoZ Labs"
      focusable="false"
      className={className}
    >
      {/* The frame, and the plate sitting inside it. Two rounded rects rather
          than a rect with a border, so the corners stay concentric at 16px. */}
    <rect width="32" height="32" rx="7" fill="#4A5B5D" />
    <rect x="2.9" y="2.9" width="26.2" height="26.2" rx="5" fill="#17211F" stroke="#3C4D4F" stroke-width="0.35" />
      {/* L in grey, Z in teal. */}
    <path d="M9.1 10.6h2.9v5.9h3.3v3H9.1Z" fill="#9BA5A5" />
    <path d="M15.7 10.6h7.2v2.5l-4.3 4h4.3v2.4h-7.3v-2.5l4.3-4h-4.2Z" fill="#33D6C3" />
    <rect x="12.2" y="22" width="7.4" height="1.8" rx="0.9" fill="#33D6C3" />
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
      <LogoMark className={`${big ? "h-9 w-9" : "h-7 w-7"} shrink-0`} />
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
