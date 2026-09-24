import { NextResponse } from "next/server";
import { markRead } from "@/lib/vault";
export async function POST(req: Request) {
  const { ids } = await req.json();
  await markRead(Array.isArray(ids) ? ids.map(String) : []);
  return NextResponse.json({ ok: true });
}
