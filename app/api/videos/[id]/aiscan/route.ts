import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR, WORK_DIR, ensureDirs } from "@/lib/paths";
import { getVideo, mergeHighlights } from "@/lib/store";
import { extractAudio } from "@/lib/ffmpeg";
import { transcribeSegments } from "@/lib/transcribe";
import { findMoments } from "@/lib/aiscan";

export const runtime = "nodejs";
export const maxDuration = 600;

/** Whole-video AI scan: Whisper transcript -> Claude picks clip-worthy moments. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  ensureDirs();
  const video = getVideo(params.id);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const audioPath = path.join(WORK_DIR, `scan-${video.id}.mp3`);
  try {
    await extractAudio(path.join(DATA_DIR, video.file), audioPath);
    const segments = await transcribeSegments(audioPath);
    const moments = await findMoments(segments, video.duration);
    mergeHighlights(video.id, "ai", moments);
    return NextResponse.json(getVideo(video.id)?.highlights ?? []);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI scan failed" },
      { status: 500 }
    );
  } finally {
    await fs.rm(audioPath, { force: true }).catch(() => {});
  }
}
