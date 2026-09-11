import StatusDock from "@/app/components/StatusDock";

/**
 * The product's shell. It leaves room at the top for the floating menu button
 * and otherwise stays out of the way: the pages below carry their own headers,
 * and this is a tool people came here to use rather than a page to be sold on.
 *
 * The one thing it does add is the corner dock — what's left of the week, and
 * that this is a beta with somewhere to report to. Mounted here rather than on
 * each page because it is true on all of them, and `pb-24` so the last thing
 * on a page can still be scrolled clear of it on a phone.
 *
 * None of the marketing layer (smooth scroll, the frame sequence) is mounted
 * here; that lives in the (marketing) group.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-24 pt-20 sm:pt-24">
      {children}
      <StatusDock />
    </div>
  );
}
