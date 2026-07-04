import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/paths";
import { deleteVideo, getVideo, listClips } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const video = getVideo(params.id);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...video, clips: listClips(video.id) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const video = getVideo(params.id);
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const files = [
    video.file,
    ...listClips(video.id).map((c) => c.file).filter(Boolean),
  ] as string[];
  for (const f of files) {
    await fs.rm(path.join(DATA_DIR, f), { force: true }).catch(() => {});
  }
  deleteVideo(video.id);
  return NextResponse.json({ ok: true });
}
