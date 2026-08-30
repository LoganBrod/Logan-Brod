import { redirect } from "next/navigation";

/**
 * The owned wardrobe is off the menu for now.
 *
 * A redirect rather than a deletion, and deliberately only this file: the
 * component, its API route and the outfit pipeline behind it are all still
 * here and still tested. Putting the page back is this one file again.
 *
 * It goes to /closet rather than to a page explaining where it went, because
 * "for now" is not a story a visitor needs told - somebody following an old
 * link wants somewhere useful, not a notice.
 */
export default function WardrobePage() {
  redirect("/closet");
}
