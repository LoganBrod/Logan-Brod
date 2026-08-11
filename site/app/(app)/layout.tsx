/**
 * The product's shell. It clears the shared rail — a bar across the top on
 * phones, a column down the left on desktop — and otherwise stays out of the
 * way: the pages below carry their own headers, and this is a tool people came
 * here to use rather than a page to be sold on.
 *
 * None of the marketing layer (smooth scroll, custom cursor, the frame
 * sequence) is mounted here; that lives in the (marketing) group.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="pt-14 lg:pl-52 lg:pt-0">{children}</div>;
}
