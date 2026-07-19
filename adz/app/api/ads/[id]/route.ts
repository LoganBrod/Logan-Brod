import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { ASSETS_DIR } from "@/lib/paths";
import { deleteAd, getAd, updateAd } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ad = getAd(params.id);
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(ad);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ad = getAd(params.id);
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  if (["draft", "active", "ended"].includes(body.status)) {
    updateAd(ad.id, { status: body.status });
  }
  return NextResponse.json(getAd(ad.id));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ad = getAd(params.id);
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await fs
    .rm(path.join(ASSETS_DIR, ad.id), { recursive: true, force: true })
    .catch(() => {});
  deleteAd(ad.id);
  return NextResponse.json({ ok: true });
}
