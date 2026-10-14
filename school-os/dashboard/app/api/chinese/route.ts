// The Chinese checker's API. check is free and instant; fix calls Claude and verifies the
// answer against the lexicon; allow adds a word to the student's list.
import { NextResponse } from "next/server";
import { check } from "@/lib/chinese";
import { loadChinese, fixChinese, allowWord } from "@/lib/chinese-fix";

export const maxDuration = 120;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { op?: string; text?: string; word?: string };
  try {
    if (body.op === "allow") {
      if (!body.word?.trim()) return NextResponse.json({ error: "no word" }, { status: 400 });
      await allowWord(body.word);
      return NextResponse.json({ ok: true });
    }
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "Paste some Chinese first." }, { status: 400 });
    if (text.length > 6000) return NextResponse.json({ error: "That is over 6,000 characters; check it in parts." }, { status: 413 });
    const { lex, list } = await loadChinese();
    if (!lex) return NextResponse.json({ error: "No Chinese lexicon yet. On the Mac, run: npm run chinese" }, { status: 409 });
    if (body.op === "fix") {
      if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Fixing needs ANTHROPIC_API_KEY. Checking is free." }, { status: 400 });
      return NextResponse.json({ op: "fix", ...(await fixChinese(text, lex, list)) });
    }
    return NextResponse.json({ op: "check", result: check(text, lex, list) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 300) : String(e) }, { status: 500 });
  }
}
