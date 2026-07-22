import { NextResponse } from "next/server";
import { clearEbayTokens } from "@/lib/store";

export const runtime = "nodejs";

export async function POST() {
  await clearEbayTokens();
  return NextResponse.json({ ok: true });
}
