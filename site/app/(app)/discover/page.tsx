import Discover from "@/app/components/Discover";

import PageHeader from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Other people's closets.
 *
 * Everything else here is private by construction — a closet lives behind a
 * six-character code and the only way in is to hold it. This page is the
 * deliberate exception, opt-in one closet at a time, and reversible.
 */
export default function DiscoverPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <PageHeader
        title={<>What everyone else built.</>}
        lede="Clozets people chose to share. Nothing is here unless its owner put it here."
      />

      <Discover />
    </main>
  );
}
