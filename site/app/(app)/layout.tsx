import Ambience from "@/app/components/Ambience";

/**
 * The product's shell. It leaves room at the top for the floating menu button
 * and otherwise stays out of the way: the pages below carry their own headers,
 * and this is a tool people came here to use rather than a page to be sold on.
 *
 * None of the marketing layer (smooth scroll, the frame sequence) is mounted
 * here; that lives in the (marketing) group.
 *
 * The ambience is what the frosted panels refract. It is mounted once, here,
 * rather than per page: it is fixed to the viewport, so a second copy would be
 * a second full-screen paint drawing exactly the same thing.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Ambience />
      <div className="pt-20 sm:pt-24">{children}</div>
    </>
  );
}
