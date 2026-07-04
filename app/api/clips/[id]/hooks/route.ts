import { NextRequest, NextResponse } from "next/server";
import { getClip, updateClip } from "@/lib/store";
import { regenerateHooks } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const clip = getClip(params.id);
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (clip.status !== "ready") {
    return NextResponse.json({ error: "Clip is still processing" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  if (typeof body.notes === "string") {
    updateClip(clip.id, { notes: body.notes.slice(0, 2000) });
  }

  await regenerateHooks(clip.id);
  return NextResponse.json(getClip(clip.id));
}
