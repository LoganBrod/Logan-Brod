import { NextRequest, NextResponse } from "next/server";
import { getClip, updateClip } from "@/lib/store";
import { postClipToX, xConfigured } from "@/lib/postx";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const clip = getClip(params.id);
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!xConfigured()) {
    return NextResponse.json(
      { error: "Add your X API keys to .env.local to post (see README)" },
      { status: 400 }
    );
  }
  if (clip.status !== "ready" || !clip.file) {
    return NextResponse.json({ error: "Clip isn't ready yet" }, { status: 409 });
  }
  if (clip.posted) {
    return NextResponse.json({ error: "Already posted" }, { status: 409 });
  }

  updateClip(clip.id, { status: "posting" });
  try {
    await postClipToX(clip.id);
    updateClip(clip.id, { status: "ready", error: undefined });
    return NextResponse.json(getClip(clip.id));
  } catch (err) {
    updateClip(clip.id, { status: "ready" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Post failed" },
      { status: 502 }
    );
  }
}
