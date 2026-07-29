import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { createInventoryLocation, listInventoryLocations } from "@/lib/ebay";
import { getEbayTokens } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  if (!(await getEbayTokens(userId))) {
    return NextResponse.json({ connected: false, locations: [] }, noStore);
  }
  try {
    return NextResponse.json(
      { connected: true, locations: await listInventoryLocations(userId) },
      noStore
    );
  } catch (err) {
    return NextResponse.json(
      {
        connected: true,
        locations: [],
        error: err instanceof Error ? err.message : "Couldn't list inventory locations",
      },
      noStore
    );
  }
}

/**
 * Create the inventory location eBay requires before publishing. eBay has no
 * web page for this — it exists only through the API — so the app has to
 * provide it or publishing can never be unblocked.
 */
export async function POST(req: NextRequest) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  if (!(await getEbayTokens(userId))) {
    return NextResponse.json({ error: "Connect your eBay account first" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : undefined);

  try {
    const location = await createInventoryLocation(userId, {
      country: str(body.country) ?? "US",
      postalCode: str(body.postalCode),
      city: str(body.city),
      stateOrProvince: str(body.stateOrProvince),
      addressLine1: str(body.addressLine1),
      name: str(body.name),
    });
    return NextResponse.json({ location }, noStore);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't create the inventory location" },
      { status: 502 }
    );
  }
}
