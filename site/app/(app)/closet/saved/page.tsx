import ClosetLibrary from "@/app/components/ClosetLibrary";
import ClosetTabs from "@/app/components/ClosetTabs";

import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Every closet this person has built, kept ones first.
 *
 * This page used to carry the standing scans and the owned wardrobe as well,
 * which made it the place three unrelated features went to be overlooked. They
 * have their own homes now; this is the library and nothing else.
 *
 * It was /closets, a menu entry level with Accessories — a list of clozets
 * presented as though it were a product beside them. It is a tab of Clozet,
 * which is what it always was. The "Build another" button is gone with the
 * move: that is the first tab now.
 */
export default function ClosetsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <ClosetTabs />

      <PageHeader title={<>Everything you&rsquo;ve built.</>} />

      <ClosetLibrary />
    </main>
  );
}
