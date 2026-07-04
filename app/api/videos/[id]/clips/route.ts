import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import {
  getVideo,
  addClip,
  getPromoSettings,
  listClips,
  type Clip,
} from "@/lib/store";
import { processClip } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json(listClips(params.id));
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const video = getVideo(params.id);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const start = Number(body.start);
  const end = Number(body.end);
  if (!isFinite(start) || !isFinite(end) || start < 0 || end <= start) {
    return NextResponse.json({ error: "Invalid start/end" }, { status: 400 });
  }
  if (end > video.duration + 1) {
    return NextResponse.json({ error: "End is past video duration" }, { status: 400 });
  }
  if (end - start > 180) {
    return NextResponse.json(
      { error: "Clips are capped at 3 minutes" },
      { status: 400 }
    );
  }

  const clip: Clip = {
    id: crypto.randomUUID().slice(0, 8),
    videoId: video.id,
    start,
    end,
    cropMode: body.cropMode === "blur" ? "blur" : "crop",
    captions: body.captions !== false,
    endCard:
      typeof body.endCard === "boolean"
        ? body.endCard
        : getPromoSettings().enabled,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : undefined,
    status: "queued",
    createdAt: new Date().toISOString(),
  };
  addClip(clip);

  // Fire-and-forget; progress is persisted to the store and polled by the UI
  void processClip(clip.id);

  return NextResponse.json(clip);
}
