import Link from "next/link";
import AccountBar from "@/app/components/AccountBar";
import ScanSettings from "@/app/components/ScanSettings";
import Watches from "@/app/components/Watches";

export const dynamic = "force-dynamic";

/**
 * Standing scans, given a page of their own.
 *
 * This is the part of the product that is a service rather than a tool, and it
 * was previously three paragraphs at the bottom of the saved-closets page —
 * which is roughly the worst place to explain why someone should pay for
 * something. The argument goes at the top, where the page can make it once,
 * properly, before showing what's running.
 */
export default function ScanPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <p className="label mb-3">Standing scans</p>
          <h1 className="font-serif text-4xl leading-none text-room-ink md:text-5xl">
            Keep looking after you close the tab.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-room-muted">
            A closet is one search on one day. Secondhand stock turns over daily, so almost
            everything that would suit you isn&rsquo;t listed at the moment you look &mdash; the
            right jacket in your size at your price goes up on a Tuesday and is gone by Wednesday.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-room-muted">
            A scan runs your searches twice a day, throws away everything it has already shown you,
            judges what&rsquo;s left exactly as a closet would, and emails you only what clears the
            same bar. Most days it finds nothing and says nothing.
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <AccountBar />
          <Link href="/closet" className="btn-ghost">
            Build a closet
          </Link>
        </div>
      </header>

      <div className="space-y-10">
        <Watches />
        <ScanSettings />
      </div>
    </main>
  );
}
