import type { Closet } from "@/lib/closet";
import OutfitList from "./OutfitList";
import PickGrid from "./PickGrid";
import ProfileCard from "./ProfileCard";

/** The read-only rendering of a closet, shared by the live run and the saved page. */
export default function ClosetView({ closet }: { closet: Closet }) {
  return (
    <div className="space-y-10">
      <ProfileCard profile={closet.profile} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl text-white">Worth buying</h2>
          <span className="text-xs text-gray-500">
            ${closet.range.min}&ndash;${closet.range.max} per piece
          </span>
        </div>
        {closet.notes && <p className="text-sm text-gray-500">{closet.notes}</p>}
        <PickGrid items={closet.items} />
      </section>

      <OutfitList outfits={closet.outfits} items={closet.items} />
    </div>
  );
}
