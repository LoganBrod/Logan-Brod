import Link from "next/link";
import AccountBar from "@/app/components/AccountBar";
import ClosetLibrary from "@/app/components/ClosetLibrary";

export const dynamic = "force-dynamic";

/** Every closet this person has built, kept ones first. */
export default function ClosetsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-14">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label mb-2">Your closets</p>
          <h1 className="font-serif text-4xl leading-none text-room-ink md:text-5xl">
            Everything you&rsquo;ve built.
          </h1>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AccountBar />
          <Link href="/" className="btn-ghost">
            Build another
          </Link>
        </div>
      </header>

      <ClosetLibrary />
    </main>
  );
}
