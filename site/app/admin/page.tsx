import TrafficReport from "@/app/components/TrafficReport";

/**
 * Outside both route groups on purpose.
 *
 * The (app) shell mounts the corner dock, which tells you how many clozets you
 * have left this week - true and useful on the product, faintly absurd above a
 * traffic report. This page gets the root shell and nothing else.
 */
export const metadata = {
  title: "Traffic — LevoZ Labs",
  // Not because it is secret — the numbers are behind a bearer secret either
  // way — but because an admin page in a search result is noise for everyone.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 pb-20 pt-24">
      <header className="mb-8">
        <h1 className="display text-[2rem] text-room-ink sm:text-[2.4rem]">Traffic.</h1>
        <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-room-muted">
          Who showed up, where from, and how far down they got. Nothing here identifies a
          person — visits are counted with a HyperLogLog, which can say how many and cannot
          say who.
        </p>
      </header>

      <TrafficReport />
    </main>
  );
}
