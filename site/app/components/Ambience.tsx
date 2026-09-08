/**
 * Something for the glass to hold.
 *
 * Frosted panels over a flat colour are not glass; they are panels at 60%
 * opacity, and the blur has nothing to do. This is what the blur is for: three
 * very wide, very soft washes of colour behind everything, so a panel picks up
 * a different tint at the top of the page than at the bottom and the edge of
 * one reads as an edge.
 *
 * Radial gradients rather than blurred divs. `filter: blur()` on something this
 * size is a full-screen repaint every scroll on a phone, and a gradient is
 * already soft - the blur would be paying for a softness we can simply draw.
 *
 * Fixed, so it does not move with the page: glass that scrolls its own
 * refraction with the content behind it is a sheet of tinted plastic.
 */
export default function Ambience() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute left-[-20%] top-[-25%] h-[70vmax] w-[70vmax]"
        style={{
          background: "radial-gradient(circle, rgb(var(--accent)) 0%, transparent 62%)",
          opacity: "calc(0.22 * var(--wash))",
        }}
      />
      <div
        className="absolute right-[-25%] top-[10%] h-[65vmax] w-[65vmax]"
        style={{
          background: "radial-gradient(circle, rgb(196 138 47) 0%, transparent 62%)",
          opacity: "calc(0.14 * var(--wash))",
        }}
      />
      <div
        className="absolute bottom-[-30%] left-[15%] h-[70vmax] w-[70vmax]"
        style={{
          background: "radial-gradient(circle, rgb(72 96 168) 0%, transparent 62%)",
          opacity: "calc(0.16 * var(--wash))",
        }}
      />
    </div>
  );
}
