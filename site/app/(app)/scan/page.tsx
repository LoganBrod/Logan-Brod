import { redirect } from "next/navigation";

/**
 * Standing scans moved onto the tools page, and are off it for now - see
 * lib/features.ts. The anchor went with the section, so this lands at the top
 * of Tools rather than at a fragment that no longer exists.
 */
export default function ScanPage() {
  redirect("/closet/tools");
}
