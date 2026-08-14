import Link from "next/link";
import AccountBar from "@/app/components/AccountBar";
import ClosetLibrary from "@/app/components/ClosetLibrary";

export const dynamic = "force-dynamic";

/**
 * Every closet this person has built, kept ones first.
 *
 * This page used to carry the standing scans and the owned wardrobe as well,
 * which made it the place three unrelated features went to be overlooked. They
 * have their own pages now; this is the library and nothing else.
 */
export default function ClosetsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">Your clozets</p>
          <h1 className="text-[2.1rem] font-semibold leading-[1.05] tracking-[-0.03em] text-room-ink md:text-[2.75rem]">
            Everything you&rsquo;ve built.
          </h1>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AccountBar />
          <Link href="/closet" className="btn-ghost">
            Build another
          </Link>
        </div>
      </header>

      <ClosetLibrary />
    </main>
  );
}
