import { NextRequest, NextResponse } from "next/server";
import { getClip } from "@/lib/store";
import { scoreClip } from "@/lib/evolve";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Re-run the Brain's performance prediction for a clip. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const clip = getClip(params.id);
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (clip.status !== "ready") {
    return NextResponse.json({ error: "Clip is still processing" }, { status: 409 });
  }
  try {
    const score = await scoreClip(clip.id);
    if (!score) {
      return NextResponse.json(
        { error: "Scoring needs ANTHROPIC_API_KEY set in .env.local" },
        { status: 400 }
      );
    }
    return NextResponse.json(getClip(clip.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scoring failed" },
      { status: 502 }
    );
  }
}
