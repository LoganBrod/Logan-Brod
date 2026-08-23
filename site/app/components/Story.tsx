import { beats, sources } from "@/lib/copy";
import { FINAL_PICKS, MAX_BATCHES, MAX_VIEWED } from "@/lib/batching";
import { SIZE_FIELDS } from "@/lib/sizing";
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
 *
 * The four beats used to be `beats.map(...)`, which is the tell that they were
 * being treated as a list when they are not one. Each says a different kind of
 * thing — one is about looking, one is arithmetic, one is five numbers, one is
 * a schedule — and rendering all four as a centred column in the middle of an
 * empty screen made a reader scroll through the same picture four times and
 * take the fourth one less seriously than the first. They are four sections
 * now, each shaped by what it actually says, which is why the map is gone.
 *
 * The proximity snap went with it. Snapping existed to enforce one-beat-per-
 * screen; the compositions carry the sequence on their own, and a snap that
 * fights the smooth scroll driving the corridor above is a cost with nothing
 * left to buy.
 */
export default function Story() {
  return (
    <>
      <section aria-label="How it works" className="relative w-full">
        <ReadsThePhotographs />
        <JudgesOnThePicture />
        <KnowsWhatFits />
        <KeepsLooking />
      </section>

      <Sources />
    </>
  );
}

/* ------------------------------------------------------------------- cloth */

/**
 * One of the two macro stills, at whichever size the screen can justify.
 *
 * A plain `<img>` rather than `next/image`, which is the house rule everywhere
 * else on this site: the optimiser wants `sharp` at runtime, this project
 * doesn't have it, and self-hosting Next without it turns every image into a
 * 500. The `srcset` does the one thing the optimiser would have done here, and
 * the small copies are built by `scripts/build-phone-frames.mjs` and committed.
 *
 * Lazy, because both of these are a long way below the fold behind a corridor
 * walk that most people take several seconds to get through.
 */
function Cloth({ name, alt, sizes }: { name: string; alt: string; sizes: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/${name}.webp`}
      srcSet={`/textures-sm/${name}.webp 1400w, /${name}.webp 2560w`}
      sizes={sizes}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="photo absolute inset-0 h-full w-full object-cover"
    />
  );
}

/* ------------------------------------------------------------------ beat 1 */

/**
 * Text and a photograph, side by side.
 *
 * The one beat that is about *looking* gets the only thing on the page you can
 * look at: a macro still of olive twill, close enough that the weave is the
 * subject. It is doing the section's argument rather than decorating it — this
 * is the level of detail the claim is about.
 */
function ReadsThePhotographs() {
  const beat = beats[0];
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-24 sm:py-32 md:grid-cols-[1fr_0.85fr] md:gap-16">
      <Reveal>
        <h3 className="display text-[2rem] text-room-ink sm:text-[2.75rem]">{beat.heading}</h3>
        <p className="mt-6 max-w-[46ch] text-[15px] leading-relaxed text-room-muted sm:text-[16px]">
          {beat.body}
        </p>
      </Reveal>

      <Reveal delay={0.12}>
        {/*
          Square rather than the portrait this would default to. The source is
          landscape, so a 4:5 box throws away seven tenths of its width and
          then asks the scaler to enlarge what's left; a square keeps the
          middle 56% and stays sharp. It also has to look nothing like the wide
          band four sections down, or the page reads as one image treatment
          repeated.
        */}
        <div className="relative aspect-square w-full overflow-hidden rounded-sm border border-room-line">
          <Cloth
            name="texture-1"
            alt="A close photograph of olive cotton twill, the weave and the fold both visible"
            sizes="(max-width: 768px) calc(100vw - 3rem), 40vw"
          />
        </div>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ beat 2 */

/**
 * The arithmetic, at the size of the argument.
 *
 * This beat's whole point is a ratio: everything the search turned up is
 * looked at, and almost none of it comes back. Written into a paragraph that
 * is a number you skim past. Set at display size with a rule between them, it
 * is the first thing you read and the sentence underneath explains it.
 *
 * Both figures are computed from the constants that actually govern a run, so
 * the page cannot drift from the app. `lib/batching.ts` holds no SDK — it is
 * imported by the browser bundle already — so this costs nothing.
 */
function JudgesOnThePicture() {
  const beat = beats[1];
  const seen = MAX_BATCHES * MAX_VIEWED;

  return (
    <div className="border-y border-room-line bg-room-panel">
      {/*
        Figures left, argument right, rather than both stacked at the left
        margin. Stacked, the whole section sat in the first third of a wide
        screen with two thirds of a panel empty beside it — which is the exact
        complaint that got the beats taken out of a narrow column in the first
        place, reintroduced one section further down.
      */}
      <div className="mx-auto grid max-w-6xl gap-y-12 px-6 py-24 sm:py-28 md:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)] md:gap-x-20">
        <Reveal>
          <dl className="flex flex-row gap-x-12 md:flex-col md:gap-y-10">
            <div>
              <dd className="display text-[3.5rem] leading-none text-room-ink sm:text-[4.5rem]">
                {seen}
              </dd>
              <dt className="mt-3 text-[13px] text-room-muted">candidates looked at</dt>
            </div>

            <div aria-hidden className="hidden h-px w-16 bg-room-line md:block" />

            <div>
              <dd className="display text-[3.5rem] leading-none text-accent sm:text-[4.5rem]">
                {FINAL_PICKS}
              </dd>
              {/* "at most" is the honest half of this. Nothing pads up to
                  twelve; a thin search returns four and says so. */}
              <dt className="mt-3 text-[13px] text-room-muted">that come back, at most</dt>
            </div>
          </dl>
        </Reveal>

        <Reveal delay={0.1}>
          <h3 className="display text-[2rem] text-room-ink sm:text-[2.75rem]">{beat.heading}</h3>
          <p className="mt-6 max-w-[52ch] text-[15px] leading-relaxed text-room-muted sm:text-[16px]">
            {beat.body}
          </p>
        </Reveal>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ beat 3 */

/**
 * Five measurements, shown as five measurements.
 *
 * The claim is "give it five things once". A reader can check that in a second
 * if the five are on the page and cannot check it at all if they are a number
 * inside a sentence. The row is hairline-divided rather than boxed: these are
 * fields on a form, not features in a pricing table.
 */
function KnowsWhatFits() {
  const beat = beats[2];
  return (
    <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <Reveal>
        <div className="max-w-[46ch]">
          <h3 className="display text-[2rem] text-room-ink sm:text-[2.75rem]">{beat.heading}</h3>
          <p className="mt-6 text-[15px] leading-relaxed text-room-muted sm:text-[16px]">
            {beat.body}
          </p>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <dl className="mt-14 grid grid-cols-2 border-t border-room-line sm:grid-cols-5">
          {SIZE_FIELDS.map((field) => (
            <div
              key={field.key}
              className="border-b border-room-line px-1 py-5 sm:border-b-0 sm:border-l sm:first:border-l-0 sm:px-5 sm:first:pl-0"
            >
              <dt className="text-[15px] font-medium text-room-ink">{field.label}</dt>
              <dd className="mt-1 font-mono text-[12px] text-room-faint">{field.unit}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </div>
  );
}

/* ------------------------------------------------------------------ beat 4 */

/**
 * A horizon, then the writing under it.
 *
 * Full-bleed and wide, deliberately unlike the contained portrait in the first
 * beat — the same two-things-on-screen arrangement twice would be the zigzag
 * that makes a page feel templated. The band also does the work of a section
 * break before the page hands over to the practical part.
 *
 * No text sits on the photograph. Text over a mid-tone image is a contrast
 * problem you have to solve with a scrim, and a scrim over a picture of cloth
 * ruins the only reason the picture is there.
 */
function KeepsLooking() {
  const beat = beats[3];
  return (
    <div className="pb-24 sm:pb-32">
      <div className="relative h-[30svh] w-full overflow-hidden sm:h-[38svh]">
        <Cloth name="texture-2" alt="A close photograph of grey ribbed wool" sizes="100vw" />
      </div>

      {/*
        Heading and body beside each other rather than stacked. Under a band
        that runs the full width of the screen, a single narrow column pinned
        to the left margin leaves the section looking like it lost something —
        and this is the fourth beat, so it is also the fourth time a reader
        would have seen the same arrangement.
      */}
      <div className="mx-auto grid max-w-6xl gap-x-16 gap-y-6 px-6 pt-14 md:grid-cols-2">
        <Reveal>
          <h3 className="display text-[2rem] text-room-ink sm:text-[2.75rem]">{beat.heading}</h3>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="max-w-[52ch] text-[15px] leading-relaxed text-room-muted sm:text-[16px]">
            {beat.body}
          </p>
        </Reveal>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- sources */

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
