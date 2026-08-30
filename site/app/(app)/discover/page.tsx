import { redirect } from "next/navigation";

/** Other people's closets are off the menu for now. See wardrobe/page.tsx. */
export default function DiscoverPage() {
  redirect("/closet");
}
