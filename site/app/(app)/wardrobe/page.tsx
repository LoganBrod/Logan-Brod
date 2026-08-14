import Link from "next/link";
import AccountBar from "@/app/components/AccountBar";
import OwnedWardrobe from "@/app/components/OwnedWardrobe";

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
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <h1 className="text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.03em] text-room-ink md:text-[2.75rem]">
            What you already own.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-room-muted">
            Photograph what&rsquo;s in your wardrobe once &mdash; several pieces per photo is fine
            &mdash; and everything the app recommends afterwards knows what you have. It builds
            outfits from what&rsquo;s there, and names the single piece that would unlock the most
            more.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AccountBar />
          <Link href="/closet" className="btn-ghost">
            Build a clozet
          </Link>
        </div>
      </header>

      <OwnedWardrobe />
    </main>
  );
}
