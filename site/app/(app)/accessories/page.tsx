import Link from "next/link";
import AccountBar from "@/app/components/AccountBar";
import AccessoryFinder from "@/app/components/AccessoryFinder";

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
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <h1 className="text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.03em] text-room-ink md:text-[2.75rem]">
            The small things.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-room-muted">
            Accessories are where an outfit most often goes wrong, and it goes wrong by being
            louder than the clothes. No upload needed &mdash; it works from the style your last
            clozet read, so what it finds sits at the same register as the rest of your wardrobe
            rather than shouting over it.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AccountBar />
          <Link href="/closet" className="btn-ghost">
            Build a clozet
          </Link>
        </div>
      </header>

      <AccessoryFinder />
    </main>
  );
}
