import Link from "next/link";
import { notFound } from "next/navigation";
import { courses, notesOf, materials } from "@/lib/vault";
import { NoteList } from "@/components/NoteList";
import { Generate } from "@/components/Generate";

export default async function CoursePage({ params, searchParams }: { params: Promise<{ course: string }>; searchParams: Promise<{ unit?: string }> }) {
  const { course: raw } = await params;
  const { unit } = await searchParams;
  const course = decodeURIComponent(raw);
  const c = (await courses()).find((x) => x.name === course);
  if (!c) notFound();
  const [notes, mats] = await Promise.all([notesOf(course, unit || undefined), materials(course)]);
  return (
    <div className="grid gap-6" style={{ ["--accent" as string]: c.hue }}>
      <header>
        <Link href="/courses" className="text-xs" style={{ color: "var(--faint)" }}>Notes /</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1">{course}</h1>
      </header>
      <div className="flex gap-1.5 flex-wrap">
        <Link href={`/courses/${raw}`} className={`px-3 py-1.5 rounded-full text-xs ${!unit ? "accent-bg" : "card-2"}`}>All</Link>
        {c.units.map((u) => <Link key={u} href={`/courses/${raw}?unit=${encodeURIComponent(u)}`} className={`px-3 py-1.5 rounded-full text-xs ${unit === u ? "accent-bg" : "card-2"}`}>{u}</Link>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <NoteList notes={notes} />
        <aside className="grid gap-4 content-start">
          <Generate course={course} units={c.units} />
          {mats.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-medium mb-2">Study material</div>
              <ul className="grid gap-1 text-sm">
                {mats.map((m) => <li key={m.rel}><Link href={`/note/${encodeURI(m.rel)}`} className="hover:underline underline-offset-4"><span className="mono text-[11px] accent-text mr-2">{m.kind}</span>{m.name.replace(`${course} - `, "")}</Link></li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
