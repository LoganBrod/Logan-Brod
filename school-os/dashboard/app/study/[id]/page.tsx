import Link from "next/link";
import { notFound } from "next/navigation";
import { assessments, courses, notesOf, materials, studyPlan, daysUntil, readNote, parseDeck, slugToId } from "@/lib/vault";
import { NoteList } from "@/components/NoteList";
import { Generate } from "@/components/Generate";
import { Flashcards } from "@/components/Flashcards";
import { Markdown } from "@/components/Markdown";

const TABS = ["notes", "review", "flashcards", "tests"] as const;

export default async function StudyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; item?: string }> }) {
  const { id: slug } = await params;
  const id = slugToId(decodeURIComponent(slug));
  const { tab = "notes", item } = await searchParams;
  const a = (await assessments()).find((x) => x.id === id);
  if (!a) notFound();
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  const c = (await courses()).find((x) => norm(x.name) === norm(a.course) || norm(x.name).startsWith(norm(a.course)) || norm(a.course).startsWith(norm(x.name)));
  const course = c?.name ?? a.course;
  const [notes, mats, plan] = await Promise.all([notesOf(course), materials(course), studyPlan()]);
  const sessions = plan.filter((s) => s.id === id);
  const d = daysUntil(a.when);
  const byKind = (k: string) => mats.filter((m) => m.kind === k);
  const active = item ? mats.find((m) => m.rel === item) : byKind(tab === "tests" ? "test" : tab)[0];
  const doc = active ? await readNote(active.rel) : null;

  return (
    <div className="grid gap-6" style={{ ["--accent" as string]: c?.hue ?? 250 }}>
      <header className="grid md:grid-cols-[1fr_auto] gap-4 items-end">
        <div>
          <div className="mono text-xs accent-text">{course}</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">{a.title}</h1>
          <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>{a.kind} · {a.when} · {sessions.length ? `${sessions.length} study session${sessions.length === 1 ? "" : "s"} booked` : "no sessions booked yet"}</div>
        </div>
        <div className="flex items-baseline gap-2"><span className="mono text-5xl font-semibold tracking-tighter">{d}</span><span style={{ color: "var(--muted)" }}>days</span></div>
      </header>

      {a.description && (
        <section className="card p-4 md:p-5 max-w-3xl">
          <div className="mono text-[11px] mb-2" style={{ color: "var(--faint)" }}>From the teacher{a.url ? <> · <a href={a.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">open on Schoology</a></> : null}</div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{a.description}</div>
        </section>
      )}

      <div className="flex gap-1.5">
        {TABS.map((t) => <Link key={t} href={`/study/${slug}?tab=${t}`} className={`px-3 py-1.5 rounded-full text-xs capitalize ${tab === t ? "accent-bg" : "card-2"}`}>{t}</Link>)}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          {tab === "notes" && <NoteList notes={notes} />}
          {tab !== "notes" && (
            <div className="grid gap-4">
              {byKind(tab === "tests" ? "test" : tab).length > 1 && (
                <div className="flex gap-1.5 flex-wrap">
                  {byKind(tab === "tests" ? "test" : tab).map((m) => <Link key={m.rel} href={`/study/${slug}?tab=${tab}&item=${encodeURIComponent(m.rel)}`} className={`px-3 py-1.5 rounded-full text-xs ${active?.rel === m.rel ? "card" : "card-2"}`}>{m.name.replace(`${course} - `, "")}</Link>)}
                </div>
              )}
              {doc ? (
                active?.kind === "flashcards" ? <Flashcards cards={parseDeck(doc.body)} /> : <div className="card p-5"><Markdown body={doc.body} /></div>
              ) : (
                <p className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>No {tab} for this course yet. Make some on the right.</p>
              )}
            </div>
          )}
        </div>
        <aside className="grid gap-4 content-start">
          <Generate course={course} units={c?.units ?? []} />
          {sessions.length > 0 && (
            <div className="card p-4">
              <div className="text-sm font-medium mb-2">Sessions</div>
              <ul className="grid gap-1 text-sm mono">
                {sessions.map((s) => <li key={s.start}>{new Date(s.start).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</li>)}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
