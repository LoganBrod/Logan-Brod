import { NextRequest, NextResponse } from "next/server";
import { getVideo, mergeHighlights } from "@/lib/store";
import { fetchMostReplayed } from "@/lib/youtube";

export const runtime = "nodejs";

/** Pull YouTube's "Most replayed" heat map for the source video. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const video = getVideo(params.id);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "Missing YouTube URL" }, { status: 400 });
  }

  try {
    const highlights = await fetchMostReplayed(body.url, video.duration);
    mergeHighlights(video.id, "youtube", highlights);
    return NextResponse.json(getVideo(video.id)?.highlights ?? []);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't fetch YouTube data" },
      { status: 502 }
    );
  }
}
