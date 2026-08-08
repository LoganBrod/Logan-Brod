import type { ClosetContents } from "@/lib/closet";
import ClosetStage from "./ClosetStage";

/**
 * A saved closet. Mounts straight to a filled wardrobe on the clip's final
 * frame — replaying the build on a page you're returning to is a delay, not a
 * flourish.
 */
export default function ClosetView({ closet }: { closet: ClosetContents }) {
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-3xl text-room-ink">Your closet</h2>
        <span className="text-xs text-room-faint">
          ${closet.range.min}&ndash;${closet.range.max} per piece &middot; hover or tap a piece
          for details
        </span>
      </div>

      <ClosetStage items={closet.items} phase="filled" />
    </section>
  );
}
