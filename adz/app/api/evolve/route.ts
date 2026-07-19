import { NextResponse } from "next/server";
import { getPlaybook } from "@/lib/store";
import { analyzePerformance } from "@/lib/brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json(getPlaybook() ?? null);
}

export async function POST() {
  try {
    return NextResponse.json(await analyzePerformance());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 400 }
    );
  }
}
