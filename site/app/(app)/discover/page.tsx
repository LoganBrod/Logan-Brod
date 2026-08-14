import AccountBar from "@/app/components/AccountBar";
import Discover from "@/app/components/Discover";

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
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <h1 className="text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.03em] text-room-ink md:text-[2.75rem]">
            What everyone else built.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-room-muted">
            Clozets people chose to share. Nothing is here unless its owner put it here, and they
            can take it down whenever they like.
          </p>
        </div>
        <AccountBar />
      </header>

      <Discover />
    </main>
  );
}
