import AccountBar from "@/app/components/AccountBar";
import SizingDesk from "@/app/components/SizingDesk";

export const dynamic = "force-dynamic";

/**
 * Measurements, and what a given brand does with them.
 *
 * These were three fields buried in the closet form, which undersold them: a
 * size is the one thing about a person that can't be inferred from behaviour,
 * and it does more work than any other input — a jacket that's perfect and two
 * sizes wrong is worth nothing.
 */
export default function SizingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-xl">
          <p className="label mb-3">Fit</p>
          <h1 className="font-serif text-4xl leading-none text-room-ink md:text-5xl">
            What actually fits you.
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-room-muted">
            Your measurements filter every search, every judgement and every scan &mdash; a listing
            that states a size you can&rsquo;t wear is dropped before anyone spends a moment on it.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-room-muted">
            Then there&rsquo;s the harder question: a 42 from one maker is not a 42 from another.
            Name a brand and the app reads its size guide and what buyers report, and tells you
            which size to buy &mdash; and says plainly when the evidence is thin.
          </p>
        </div>
        <AccountBar />
      </header>

      <SizingDesk />
    </main>
  );
}
