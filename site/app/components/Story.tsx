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
        {/* Proximity snapping, not mandatory: it pulls a beat to centre when you
            stop near one, and stays out of the way when you are scrolling
            through. Mandatory would fight the smooth scroll above and trap
            anyone trying to get past this section quickly. */}
        <ol className="snap-y snap-proximity">
          {beats.map((beat, index) => (
            /*
              One beat per screen, centred.

              These were stacked in a 5xl column with the number in a left
              gutter, which put every block slightly left of centre in the top
              third of the page and left the rest of the screen empty - content
              adrift in the middle of nothing. Giving each beat the full
              viewport and centring it means the thing you are reading is the
              only thing on screen, and scrolling advances one idea at a time.
            */
            <li
              key={beat.kicker}
              className="flex min-h-[85svh] w-full snap-center items-center justify-center px-6 sm:min-h-[100svh]"
            >
              <Reveal className="w-full">
                <div className="mx-auto flex max-w-[52ch] flex-col items-center text-center">
                  {/*
                    Two things used to sit above this headline: a mono "01" and
                    a small-caps kicker restating it. Both are gone. Numbering
                    sections tells a reader something they can already see, and
                    the kicker said the headline again more quietly. The
                    headline alone was always enough.
                  */}
                  <h3 className="display text-[2rem] text-room-ink sm:text-[3rem]">
                    {beat.heading}
                  </h3>
                  <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-room-muted sm:text-[16px]">
                    {beat.body}
                  </p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
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
            <h2 className="display text-[1.65rem] text-room-ink sm:text-[2.1rem]">
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

      {/*
        A grid of squares rather than a rotating strip.

        The marquee moved, which made it read as decoration you wait out; a
        block of equal squares reads as a set you can take in at once, and it
        holds still long enough to actually be read. Sixteen labels land as a
        4x4 on a wide screen and a 2x8 on a phone, so it stays a square block
        rather than becoming a long ragged list.
      */}
      <Reveal delay={0.15}>
        <div className="mx-auto max-w-5xl px-6 pb-24 sm:pb-28">
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-room-line bg-room-line sm:grid-cols-3 lg:grid-cols-4">
            {sources.labels.map((label) => (
              <li
                key={label}
                className="group flex aspect-square items-center justify-center bg-room-panel px-3 text-center transition-colors duration-300 hover:bg-room-sunk"
              >
                <span className="text-[14px] font-medium tracking-[-0.01em] text-room-faint transition-colors duration-300 group-hover:text-room-ink sm:text-[15px]">
                  {label}
                </span>
              </li>
            ))}
          </ul>

          <p className="pt-5 text-[12px] leading-relaxed text-room-faint">
            {sources.labelsCaption}
          </p>
        </div>
      </Reveal>
    </section>
  );
}
