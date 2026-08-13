import SmoothScroll from "../components/SmoothScroll";

/**
 * Marketing-only machinery lives here rather than in the root layout, so the
 * product never pays for it: Lenis smooth scroll would fight a form. The menu
 * itself is shared, and mounts in the root layout.
 *
 * There was a custom cursor here — a dot with a trailing ring. It has been
 * removed: a ring that lags the pointer makes a person doubt whether the page
 * is listening, and the native arrow already says everything a cursor needs to.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SmoothScroll />
      {children}
    </>
  );
}
