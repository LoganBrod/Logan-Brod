import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/auth";
import { getPlaybook } from "@/lib/store";
import { analyzePerformance } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  return NextResponse.json((await getPlaybook(userId)) ?? null);
}

export async function POST() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to continue" }, { status: 401 });
  }
  try {
    return NextResponse.json(await analyzePerformance(userId));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 400 }
    );
  }
}
