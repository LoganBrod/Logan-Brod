import Link from "next/link";
import AccountBar from "@/app/components/AccountBar";
import CologneDesk from "@/app/components/CologneDesk";

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
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <h1 className="text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.03em] text-room-ink md:text-[2.75rem]">
            Something that suits you.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-room-muted">
            Told plainly: what it smells like, how long it lasts, whether everyone else is already
            wearing it, and why it sits with the way you dress. If you&rsquo;ve built a clozet it
            reads your style from that.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-room-muted">
            This page recommends - it doesn&rsquo;t search the marketplaces the rest of the
            site does. Fragrance is one of the most counterfeited things sold online and a fake
            looks identical in a photograph, so you get names to look for and shops worth trusting
            instead of cheap bottles of something.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AccountBar />
          <Link href="/closet" className="btn-ghost">
            Build a clozet
          </Link>
        </div>
      </header>

      <CologneDesk />
    </main>
  );
}
