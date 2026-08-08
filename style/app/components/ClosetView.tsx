import type { ClosetContents } from "@/lib/closet";
import Closet from "./Closet";

/**
 * A run's results, shared by the live run and the saved-closet page. Takes
 * contents rather than a saved `Closet` so results still render when saving
 * was unavailable.
 */
export default function ClosetView({ closet }: { closet: ClosetContents }) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-3xl text-room-ink">Your closet</h2>
        <span className="text-xs text-room-faint">
          ${closet.range.min}&ndash;${closet.range.max} per piece &middot; hover a piece for
          details
        </span>
      </div>

      <Closet items={closet.items} />
    </section>
  );
}
