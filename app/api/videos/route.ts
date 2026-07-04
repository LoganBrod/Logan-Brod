import { NextResponse } from "next/server";
import { listVideos, listClips } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const videos = listVideos();
  const clips = listClips();
  return NextResponse.json(
    videos.map((v) => ({
      ...v,
      clipCount: clips.filter((c) => c.videoId === v.id).length,
    }))
  );
}
