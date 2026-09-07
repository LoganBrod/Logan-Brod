import { SkeletonHeader, SkeletonRows } from "@/app/components/Waiting";

/**
 * What every product page shows while its server render is on the way.
 *
 * Without this, moving between pages left the old page standing until the
 * new one arrived, which on a slow connection is a click that did nothing.
 * Nothing here is real content; it is the page's shape, so the switch to the
 * page itself is a fill rather than a jump.
 */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <SkeletonHeader />
      <SkeletonRows rows={3} />
    </main>
  );
}
