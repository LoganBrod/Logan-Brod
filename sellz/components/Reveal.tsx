/**
 * Staggered fade-up wrapper for grids and lists. Wrap each item with
 * `<Reveal index={i}>`.
 *
 * Deliberately CSS-only rather than JS-driven: an entrance that starts at
 * opacity 0 must never depend on hydration succeeding, or slow and failed
 * scripts leave the page looking empty. The global prefers-reduced-motion
 * rule in globals.css collapses this to an instant appearance.
 */
export default function Reveal({
  children,
  index = 0,
  className = "",
}: {
  children: React.ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <div
      className={`animate-rise min-w-0 transition-transform duration-200 hover:-translate-y-0.5 ${className}`}
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
    >
      {children}
    </div>
  );
}
