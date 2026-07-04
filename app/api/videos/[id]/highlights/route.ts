import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { DATA_DIR } from "@/lib/paths";
import { getVideo, updateVideo } from "@/lib/store";
import { detectHighlights } from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const video = getVideo(params.id);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const highlights = await detectHighlights(
      path.join(DATA_DIR, video.file),
      video.duration
    );
    updateVideo(video.id, { highlights });
    return NextResponse.json(highlights);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Highlight detection failed" },
      { status: 500 }
    );
  }
}
