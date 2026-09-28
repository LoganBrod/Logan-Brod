// Saves a note from the Write page into the vault's inbox, inside a folder named after the
// course, so the brain files it: typed markdown for free, handwriting through Claude.
import { NextResponse } from "next/server";
import { courses } from "@/lib/vault";
import { store } from "@/lib/store";

const clean = (s: string) => s.replace(/[\\/:*?"<>|#^[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { course?: string; title?: string; text?: string; pdf?: string } | null;
  if (!body) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const cs = await courses();
  const course = cs.find((c) => c.name === body.course)?.name;
  if (!course) return NextResponse.json({ error: "pick a course" }, { status: 400 });
  const date = new Date().toISOString().slice(0, 10);
  const title = clean(body.title || "") || `Notes ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  const base = `00 Inbox/${course}/${date} ${title}`;
  if (body.pdf) {
    const bytes = Buffer.from(body.pdf, "base64");
    if (bytes.length > 25 * 1024 * 1024) return NextResponse.json({ error: "that is over 25 MB; save fewer pages at a time" }, { status: 413 });
    await store.writeBinary(`${base}.pdf`, bytes);
  } else if (body.text?.trim()) {
    const md = `---\ntitle: ${JSON.stringify(title)}\ncourse: ${JSON.stringify(course)}\ndate: '${date}'\ntype: notes\nsource_kind: ipad\nstatus: raw\n---\n\n# ${title}\n\n${body.text.trim()}\n`;
    await store.writeFile(`${base}.md`, md);
  } else return NextResponse.json({ error: "nothing to save" }, { status: 400 });
  return NextResponse.json({ ok: true, saved: `${base}${body.pdf ? ".pdf" : ".md"}` });
}
