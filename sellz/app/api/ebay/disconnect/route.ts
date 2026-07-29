import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { clearEbayTokens } from "@/lib/store";

export const runtime = "nodejs";

export async function POST() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  await clearEbayTokens(userId);
  return NextResponse.json({ ok: true });
}
