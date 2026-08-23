import CologneDesk from "@/app/components/CologneDesk";

import PageHeader, { PageNote } from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The one page here that recommends rather than sells.
 *
 * Every other part of this site finds real listings on secondhand markets.
 * Fragrance is the category where that would be irresponsible: it's among the
 * most counterfeited things sold online, a fake is indistinguishable in a
 * photograph, and the people using this have no particular reason to know that.
 * So this recommends from knowledge and points at sellers who can be held to
 * it — and says so on the page rather than quietly behaving differently.
 */
export default function ColognesPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <PageHeader
        title={<>Something that suits you.</>}
        lede="What it smells like, how long it lasts, and why it suits the way you dress."
        action={{ href: "/closet", label: "Build a clozet" }}
      />

      <PageNote>
        This page recommends rather than searching the marketplaces the rest of the site does. Fragrance is one of the most counterfeited things sold online and a fake looks identical in a photograph, so you get names to look for and shops worth trusting instead of cheap bottles of something.
      </PageNote>

      <CologneDesk />
    </main>
  );
}
