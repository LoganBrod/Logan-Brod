import OwnedWardrobe from "@/app/components/OwnedWardrobe";

import PageHeader, { PageNote } from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * What you already own, and what it makes.
 *
 * The same pipeline as a closet, pointed inwards: photographs are read for what
 * the garments are, then outfits are assembled from them. Nothing is stored but
 * a line of text per piece — the photos are read once and thrown away, which is
 * why this needs no storage service and why a person can correct an entry the
 * app got wrong.
 */
export default function WardrobePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <PageHeader
        title={<>What you already own.</>}
        lede="Photograph your wardrobe once, and everything recommended afterwards knows what you have."
        action={{ href: "/closet", label: "Build a clozet" }}
      />

      <PageNote>Several pieces per photo is fine. It builds outfits from what is there, and names the single piece that would unlock the most more.</PageNote>

      <OwnedWardrobe />
    </main>
  );
}
