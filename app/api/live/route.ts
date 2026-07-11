import { NextRequest, NextResponse } from "next/server";
import { listLiveSessions } from "@/lib/store";
import { reconcileSessions, startWatch } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(reconcileSessions(listLiveSessions()));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.channel !== "string" || !body.channel.trim()) {
    return NextResponse.json(
      { error: "Enter a Kick channel name or an .m3u8 stream URL" },
      { status: 400 }
    );
  }
  try {
    const session = await startWatch(body.channel);
    return NextResponse.json(session);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't start watching" },
      { status: 502 }
    );
  }
}
