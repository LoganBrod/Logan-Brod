import { NextRequest, NextResponse } from "next/server";
import { getClip, updateClip } from "@/lib/store";
import { refreshMetrics } from "@/lib/postx";

export const runtime = "nodejs";

/** Manually record a clip's performance numbers. */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const clip = getClip(params.id);
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const n = (v: unknown) => (isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
  updateClip(clip.id, {
    metrics: {
      views: n(body.views),
      likes: n(body.likes),
      reposts: n(body.reposts),
      updatedAt: new Date().toISOString(),
    },
  });
  return NextResponse.json(getClip(clip.id));
}

/** Pull fresh metrics from the X API (needs API keys + read quota). */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await refreshMetrics(params.id);
    return NextResponse.json(getClip(params.id));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 502 }
    );
  }
}
