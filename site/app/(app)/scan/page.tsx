import { redirect } from "next/navigation";

/** Standing scans moved onto the tools page. See sizing/page.tsx. */
export default function ScanPage() {
  redirect("/tools#scans");
}
