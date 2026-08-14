import { beats, sources } from "@/lib/copy";
import Reveal from "./Reveal";

/**
 * What the corridor doesn't say.
 *
 * The walk is atmosphere — it tells you the register and nothing about the
 * mechanics, and a visitor who liked the feel then scrolled into a footer had
 * no way to find out what the thing actually does. This is the part that
 * answers that, arriving a beat at a time as you come down the page.
 *
 * Deliberately not pinned or scrubbed. There is already one scroll-hijacked
 * section above; a second would make the page feel like it was steering, and
 * the job here is reading rather than watching.
 */
export default function Story() {
  return (
    <>
      <section aria-label="How it works" className="relative w-full">
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
          <ol className="flex flex-col gap-20 sm:gap-28">
            {beats.map((beat, index) => (
              <li key={beat.kicker}>
                <Reveal>
                  {/* Two columns from sm: the number and kicker hold the left,
                      so the eye has a rail to run down rather than four
                      identically-centred blocks. */}
                  <div className="grid gap-4 sm:grid-cols-[7rem_1fr] sm:gap-10">
                    <div className="flex items-baseline gap-3 sm:flex-col sm:gap-2">
                      <span className="font-mono text-[12px] tabular-nums text-accent">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="eyebrow">{beat.kicker}</span>
                    </div>

                    <div className="max-w-[46ch]">
                      <h3 className="text-[1.65rem] font-semibold leading-[1.12] tracking-[-0.025em] text-room-ink sm:text-[2.1rem]">
                        {beat.heading}
                      </h3>
                      <p className="mt-4 text-[15px] leading-relaxed text-room-muted">
                        {beat.body}
                      </p>
                    </div>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Sources />
    </>
  );
}

/**
 * Where the pieces come from.
 *
 * The distinction this section exists to make is that Clozet holds no stock and
 * has no arrangement with any label. A row of brand names on a homepage is read
 * as a client list by default, so the caption does real work and is not
 * decoration — it is the difference between a true page and a false one.
 */
export function Sources() {
  return (
    <section aria-label="Where the pieces come from" className="relative w-full border-t border-room-line">
      <div className="mx-auto max-w-5xl px-6 py-24 sm:py-28">
        <Reveal>
          <div className="max-w-[46ch]">
            <p className="eyebrow mb-4">Where they come from</p>
            <h2 className="text-[1.65rem] font-semibold leading-[1.12] tracking-[-0.025em] text-room-ink sm:text-[2.1rem]">
              {sources.heading}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-room-muted">{sources.body}</p>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <dl className="mt-12 grid gap-px overflow-hidden rounded-sm border border-room-line bg-room-line sm:grid-cols-2">
            {sources.markets.map((market) => (
              <div key={market.name} className="bg-room-panel px-6 py-6">
                <dt className="text-lg font-semibold tracking-[-0.015em] text-room-ink">
                  {market.name}
                </dt>
                <dd className="mt-1.5 text-[13px] leading-relaxed text-room-muted">{market.note}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>

      {/* The labels themselves, running past. Full-bleed and edge-faded so it
          reads as something passing rather than as a bordered logo wall. */}
      <Reveal delay={0.15}>
        <div className="marquee-fade relative overflow-hidden border-y border-room-line py-6">
          <div className="marquee flex w-max items-center gap-10 pl-10">
            {/* Twice, so the loop has something to run into. aria-hidden on the
                second copy: a screen reader should hear the list once. */}
            {[0, 1].map((copy) => (
              <div key={copy} aria-hidden={copy === 1} className="flex items-center gap-10">
                {sources.labels.map((label) => (
                  <span
                    key={label}
                    className="whitespace-nowrap text-[15px] font-medium tracking-[-0.01em] text-room-faint"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="mx-auto max-w-5xl px-6 pt-5 text-[12px] leading-relaxed text-room-faint">
          {sources.labelsCaption}
        </p>
      </Reveal>
    </section>
  );
}
