import { NextRequest, NextResponse } from "next/server";
import { deleteLiveSession, getLiveSession } from "@/lib/store";
import { isWatcherActive, stopWatch } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getLiveSession(params.id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(session);
}

/** Stop watching (keeps the recording), or remove a stopped session record. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getLiveSession(params.id);
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isWatcherActive(params.id)) {
    stopWatch(params.id);
    return NextResponse.json({ ok: true, stopped: true });
  }
  deleteLiveSession(params.id);
  return NextResponse.json({ ok: true, removed: true });
}
