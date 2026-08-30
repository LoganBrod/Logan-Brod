"use client";

import Link from "next/link";
import type { PriceRange } from "@/lib/sources/types";

/**
 * The door from a finished clozet to the small things.
 *
 * Accessories and colognes could always read a clozet's style, but nothing on
 * the clozet page said so. You had to already know the other pages existed,
 * open the menu, find them, and trust that "your last clozet" meant the one you
 * had just been looking at. Almost nobody does that, so two of the three things
 * this app makes were reachable in theory and unvisited in practice.
 *
 * It appears the moment a clozet is finished and saved, which is the one moment
 * the offer is obviously about something: the palette is on screen, the pieces
 * are hanging, and "the small things to go with these" needs no explanation.
 *
 * Only when there is a code. Without one the clozet was never stored, so there
 * is nothing for the other pages to read and the offer would be a broken
 * promise rather than a door.
 */
export default function MatchPrompt({
  code,
  range,
}: {
  code: string;
  /** The clozet's price band, used to guess a fragrance budget. */
  range: PriceRange;
}) {
  return (
    <div className="panel flex flex-wrap items-center justify-between gap-4 px-6 py-4">
      <p className="max-w-md text-sm leading-relaxed text-room-muted">
        The small things, against this clozet. Jewellery and a watch chosen on the same palette,
        and a fragrance that sits at the same register.
      </p>

      <div className="flex shrink-0 flex-wrap gap-3">
        {/*
          Jewellery and watches pre-ticked rather than an empty picker. The
          offer is specific - "things to go with this" - so landing on a blank
          form makes the person do the work the offer implied was done.
          Everything stays changeable on the page.
        */}
        <Link
          href={`/accessories?from=${code}&kinds=jewellery,watches`}
          className="btn-primary whitespace-nowrap"
        >
          Match accessories
        </Link>
        <Link
          href={`/colognes?from=${code}&budget=${budgetFor(range)}`}
          className="btn-ghost whitespace-nowrap"
        >
          Match a cologne
        </Link>
      </div>
    </div>
  );
}

/**
 * A fragrance budget guessed from the clothing budget.
 *
 * Not the same money and not meant to be - it is a guess at the register
 * somebody shops at, not a claim that a person who buys £250 coats spends £250
 * on scent. Wrong for plenty of people, which is why it only preselects a
 * choice that stays visible and one click from being changed.
 *
 * Read off the top of the range rather than the middle: the ceiling is what
 * somebody set deliberately, while the floor is usually left where it started.
 */
export function budgetFor(range: PriceRange): string {
  if (range.max <= 80) return "under-50";
  if (range.max <= 250) return "50-120";
  return "over-120";
}
