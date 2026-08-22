import { redirect } from "next/navigation";

/**
 * Sizing moved onto the tools page.
 *
 * Kept as a redirect rather than deleted: this path has been linked from the
 * nav, from the closet page and from anywhere anybody bookmarked it, and a 404
 * is a worse answer than a jump to where the thing now lives.
 */
export default function SizingPage() {
  redirect("/tools#fit");
}
