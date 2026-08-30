import { redirect } from "next/navigation";

/** The library became a tab of Clozet. See tools/page.tsx. */
export default function ClosetsRedirect() {
  redirect("/closet/saved");
}
