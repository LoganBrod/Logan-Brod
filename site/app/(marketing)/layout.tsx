import SmoothScroll from "../components/SmoothScroll";
import Cursor from "../components/Cursor";

/**
 * Marketing-only machinery lives here rather than in the root layout, so the
 * product never pays for it: Lenis smooth scroll would fight a form, and the
 * custom cursor has no business over an interface people have to use. The rail
 * itself is shared, and mounts in the root layout.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll />
      <Cursor />
      {children}
    </>
  );
}
