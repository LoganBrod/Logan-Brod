import { sources } from "@/lib/copy";
import Reveal from "./Reveal";

/**
 * Where the pieces come from.
 *
 * The distinction this section exists to make is that Clozet holds no stock:
 * every piece on a rail is somebody else's listing, and the app sends you to
 * them. It used to carry sixteen label names under a caption explaining that
 * there is no arrangement with any of them. Both are gone together, which is
 * the only honest way to drop either - the caption existed because the list
 * did, and a page that names no brands implies no relationship to deny.
 *
 * It lives here rather than in Story, which no longer exists: the closet page
 * shows this section too, and a shared component that lived inside the
 * marketing page's story was one file away from being deleted with it.
 */
export default function Sources() {
  return (
    <section aria-label="Where the pieces come from" className="relative w-full">
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <Reveal>
          <div className="mx-auto max-w-[52ch] text-center">
            <h2 className="display text-room-ink [font-size:clamp(1.5rem,3vw,2.1rem)] [text-wrap:balance]">
              {sources.heading}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-room-muted">{sources.body}</p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <dl className="mx-auto mt-10 grid max-w-3xl gap-px overflow-hidden rounded-[14px] border border-room-line bg-room-line sm:grid-cols-2">
            {sources.markets.map((market) => (
              <div key={market.name} className="bg-room-panel px-6 py-6">
                <dt className="text-[16px] font-semibold tracking-[-0.015em] text-room-ink">
                  {market.name}
                </dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-room-muted">{market.note}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
