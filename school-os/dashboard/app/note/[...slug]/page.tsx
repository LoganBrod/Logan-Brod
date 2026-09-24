import Link from "next/link";
import { notFound } from "next/navigation";
import { readNote, resolveLink, hueOf, parseDeck } from "@/lib/vault";
import { Markdown } from "@/components/Markdown";
import { Flashcards } from "@/components/Flashcards";

export default async function NotePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params; // segments arrive URL-encoded
  const rel = slug.map(decodeURIComponent).join("/");
  const note = await readNote(rel);
  if (!note) notFound();
  const course = String(note.data.course ?? "");
  const links: Record<string, string | null> = {};
  for (const m of note.body.matchAll(/\[\[([^\]|#]+)/g)) if (!(m[1] in links)) links[m[1]] = await resolveLink(m[1]);
  const isDeck = String(note.data.kind) === "flashcards";
  const name = rel.split("/").pop()!.replace(/\.md$/, "");
  return (
    <article className="grid gap-5 max-w-3xl" style={{ ["--accent" as string]: hueOf(course) }}>
      <header>
        <div className="text-xs flex gap-2 flex-wrap" style={{ color: "var(--faint)" }}>
          {course && <Link href={`/courses/${encodeURIComponent(course)}`} className="accent-text">{course}</Link>}
          {note.data.unit ? <span>· {String(note.data.unit)}</span> : null}
          {note.data.type ? <span>· {String(note.data.type)}</span> : null}
          {note.data.date ? <span>· {String(note.data.date).slice(0, 10)}</span> : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mt-1 leading-tight">{name}</h1>
      </header>
      {isDeck ? <Flashcards cards={parseDeck(note.body)} /> : <Markdown body={note.body} links={links} />}
    </article>
  );
}
