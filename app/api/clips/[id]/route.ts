import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "@/lib/paths";
import { deleteClip, getClip } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const clip = getClip(params.id);
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(clip);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const clip = getClip(params.id);
  if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (clip.file) {
    await fs.rm(path.join(DATA_DIR, clip.file), { force: true }).catch(() => {});
  }
  deleteClip(clip.id);
  return NextResponse.json({ ok: true });
}
