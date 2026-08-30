import { redirect } from "next/navigation";

/**
 * Tools became a tab of Clozet.
 *
 * Kept as a redirect rather than deleted, the same way /sizing and /scan were
 * when they folded into this page: it has been in the menu, in the footer, and
 * in anything anybody bookmarked, and a 404 is a worse answer than a jump to
 * where the thing now lives.
 */
export default function ToolsRedirect() {
  redirect("/closet/tools");
}
