import AccessoryFinder from "@/app/components/AccessoryFinder";

import PageHeader, { PageNote } from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The small things, chosen against a style you already have.
 *
 * Not a second clozet, on purpose. Nobody keeps photographs of belts, and
 * asking for them would mean a full second run at full price for the part of an
 * outfit that costs the least — so this reads the profile from the last clozet
 * and asks only which kinds of thing you're after.
 */
export default function AccessoriesPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <PageHeader
        title={<>The small things.</>}
        lede="Accessories are where an outfit goes wrong, and it goes wrong by being louder than the clothes."
        action={{ href: "/closet", label: "Build a clozet" }}
      />

      <PageNote>
        No upload needed. It works from the style your last clozet read, so what it finds sits at the same register as the rest of your wardrobe rather than shouting over it.
      </PageNote>

      <AccessoryFinder />
    </main>
  );
}
