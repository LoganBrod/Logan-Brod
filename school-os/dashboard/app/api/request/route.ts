import { NextResponse } from "next/server";
import { requestMaterial } from "@/lib/vault";
export async function POST(req: Request) {
  const { course, unit, kind } = await req.json();
  if (!["flashcards", "test", "review"].includes(kind)) return NextResponse.json({ error: "bad kind" }, { status: 400 });
  try { await requestMaterial(String(course), String(unit ?? ""), kind); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 }); }
}
