/**
 * Two rails of clothes drifting past each other, forever.
 *
 * What sat here before was a macro photograph of twill: atmosphere, and no
 * argument. This is the same square footage spent on the only thing the
 * product is about, which is garments - twelve of them, in twelve colours,
 * moving. It runs on its own without asking for a scroll, so the page has
 * something alive in it the moment it loads rather than something that
 * happens to you as you come down.
 *
 * Rows run in opposite directions because two rails moving the same way read
 * as one thing sliding; opposed, they read as depth.
 *
 * CSS only - no observer, no JavaScript, no library. The track holds the same
 * row twice and translates exactly half its width, so the seam lands on an
 * identical frame and the loop is invisible. That exactness is why the space
 * between cards is a margin on each card rather than a flex gap: with a gap,
 * half the track is half a gap short of one full repeat, and the row twitches
 * once a minute forever.
 */

/** Cloth against a colour it isn't. Fixed hex, like the corridor footage: these are pictures, not surfaces. */
const CARDS = [
  { src: "garment-shirt", bg: "#1F4E4A", alt: "An olive cotton overshirt on a hanger" },
  { src: "garment-knit-amber", bg: "#2C3A56", alt: "An amber wool crewneck on a hanger" },
  { src: "garment-pants-indigo", bg: "#C9B79A", alt: "Indigo trousers on a hanger" },
  { src: "garment-jacket-plum", bg: "#3C4A2E", alt: "A plum chore jacket on a hanger" },
  { src: "garment-shirt-cobalt", bg: "#D8CFC0", alt: "A cobalt overshirt on a hanger" },
  { src: "garment-knit-moss", bg: "#4A3B52", alt: "A moss green crewneck on a hanger" },
];

const CARDS_LOWER = [
  { src: "garment-jacket-teal", bg: "#C4A88C", alt: "A teal chore jacket on a hanger" },
  { src: "garment-pants-clay", bg: "#28405C", alt: "Clay trousers on a hanger" },
  { src: "garment-shirt-rust", bg: "#B9C4B0", alt: "A rust overshirt on a hanger" },
  { src: "garment-knit", bg: "#6B4A3A", alt: "An oatmeal wool crewneck on a hanger" },
  { src: "garment-jacket", bg: "#7A3F52", alt: "An olive chore jacket on a hanger" },
  { src: "garment-pants", bg: "#2F5E52", alt: "Grey wool trousers on a hanger" },
];

function Card({ src, bg, alt, index }: { src: string; bg: string; alt: string; index: number }) {
  return (
    <div
      className="rail-card mr-3 w-[9.5rem] shrink-0 overflow-hidden rounded-[14px] sm:mr-5 sm:w-[13rem]"
      style={{
        background: bg,
        // Each card breathes on its own clock, so the row is twelve things
        // floating rather than one strip wobbling.
        animationDuration: `${5.5 + (index % 4) * 0.9}s`,
        animationDelay: `-${(index % 6) * 0.8}s`,
      }}
    >
      <div className="flex aspect-[3/4] items-center justify-center p-4 sm:p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/garments-sm/${src}.webp`}
          alt={alt}
          decoding="async"
          className="h-full w-full select-none object-contain drop-shadow-[0_12px_16px_rgba(10,10,12,0.35)]"
        />
      </div>
    </div>
  );
}

function Row({ cards, reverse, seconds }: { cards: typeof CARDS; reverse?: boolean; seconds: number }) {
  const half = (
    <div className="flex shrink-0" aria-hidden={reverse ? undefined : undefined}>
      {cards.map((card, i) => (
        <Card key={card.src} {...card} index={i} />
      ))}
    </div>
  );
  return (
    <div className="rail-fade overflow-hidden">
      <div
        className={`rail-track flex w-max ${reverse ? "rail-track-reverse" : ""}`}
        style={{ animationDuration: `${seconds}s` }}
      >
        {half}
        {/* The same row again. Screen readers get it once: the second copy is
            the first one's seam, not more clothes. */}
        <div aria-hidden className="flex shrink-0">
          {cards.map((card, i) => (
            <Card key={`${card.src}-copy`} {...card} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function FloatingRail() {
  return (
    <section aria-label="Pieces a run turns up" className="w-full space-y-3 overflow-hidden py-6 sm:space-y-5 sm:py-10">
      <Row cards={CARDS} seconds={64} />
      <Row cards={CARDS_LOWER} seconds={78} reverse />
    </section>
  );
}
