import Link from "next/link";
import { courses, tests, studyPlan, notifications, needsReview, notesOf, daysUntil, materials, idToSlug, brief } from "@/lib/vault";
import { Markdown } from "@/components/Markdown";
import { Greeting } from "@/components/Greeting";

export default async function Home() {
  const [cs, ts, plan, notes, review, mats, b] = await Promise.all([courses(), tests(), studyPlan(), notifications(), needsReview(), materials(), brief()]);
  const briefToday = b && b.date === new Date().toISOString().slice(0, 10) ? b : null;
  const todayStr = new Date().toDateString();
  const todaySessions = plan.filter((s) => new Date(s.start).toDateString() === todayStr);
  const unread = notes.filter((n) => !n.read).slice(0, 5);
  const recent = (await Promise.all(cs.map((c) => notesOf(c.name)))).flat().sort((a, b) => b.mtime - a.mtime).slice(0, 6);
  const hue = (course: string) => cs.find((c) => c.name === course)?.hue ?? 250;

  return (
    <div className="grid gap-8">
      <Greeting name={process.env.USER_NAME || ""} hasBrief={Boolean(briefToday)} subtitle={ts.length ? `${ts.length} assessment${ts.length === 1 ? "" : "s"} coming up. ${review ? `${review} note${review === 1 ? "" : "s"} need${review === 1 ? "s" : ""} you.` : "Inbox is clean."}` : "Nothing posted yet."} />

      {briefToday && (
        <section className="card p-5 md:p-7 max-w-3xl rise" style={{ ["--i" as string]: 2 }}>
          <div className="mono text-[11px] mb-2" style={{ color: "var(--faint)" }}>Brief · {new Date(briefToday.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
          <div className="text-[15px]"><Markdown body={briefToday.text} /></div>
          <Link href="/chat" className="inline-block mt-4 text-sm accent-text underline underline-offset-4">Ask about it</Link>
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-3 rise" style={{ ["--i" as string]: 3 }}>
        {ts.slice(0, 3).map((t) => {
          const d = daysUntil(t.when);
          return (
            <Link key={t.id} href={`/study/${idToSlug(t.id)}`} className="card pressable p-5 hover:bg-[var(--surface-2)]" style={{ ["--accent" as string]: hue(t.course) }}>
              <div className="mono text-xs accent-text">{t.course}</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="mono text-5xl font-light tracking-tighter">{d}</span>
                <span style={{ color: "var(--muted)" }}>day{d === 1 ? "" : "s"}</span>
              </div>
              <div className="mt-2 font-medium leading-snug">{t.title}</div>
              <div className="text-xs mt-1" style={{ color: "var(--faint)" }}>{t.kind} · {t.when}</div>
            </Link>
          );
        })}
        {ts.length === 0 && <div className="card p-5 md:col-span-3 text-sm" style={{ color: "var(--muted)" }}>No tests, quizzes or projects on Schoology yet. They show up here the moment a teacher posts one.</div>}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px] rise" style={{ ["--i" as string]: 4 }}>
        <div className="grid gap-8">
          <section>
            <h2 className="text-sm font-medium mb-3" style={{ color: "var(--muted)" }}>Today</h2>
            {todaySessions.length ? (
              <ul className="grid gap-2">
                {todaySessions.map((s) => (
                  <li key={s.start}>
                    <Link href={`/study/${idToSlug(s.id)}`} className="card pressable flex items-center gap-4 p-4 hover:bg-[var(--surface-2)]" style={{ ["--accent" as string]: hue(s.course) }}>
                      <span className="mono text-sm w-24 shrink-0">{time(s.start)}–{time(s.end)}</span>
                      <span className="w-1.5 h-8 rounded-full accent-bg shrink-0" />
                      <span><span className="font-medium">{s.course}</span> <span style={{ color: "var(--muted)" }}>· {s.title}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm" style={{ color: "var(--muted)" }}>No study sessions booked today.{plan.length === 0 && " Set up the planner to get a schedule."}</p>
            )}
          </section>

          <section>
            <h2 className="text-sm font-medium mb-3" style={{ color: "var(--muted)" }}>Recently filed</h2>
            <ul className="grid gap-2 md:grid-cols-2">
              {recent.map((n) => (
                <li key={n.rel}>
                  <Link href={`/note/${encodeURI(n.rel)}`} className="card pressable block p-4 hover:bg-[var(--surface-2)]" style={{ ["--accent" as string]: hue(n.course) }}>
                    <div className="mono text-[11px] accent-text">{n.course}{n.unit ? ` · ${n.unit}` : ""}</div>
                    <div className="mt-1 font-medium leading-snug">{n.name.replace(/^\d{4}-\d{2}-\d{2}\s*/, "")}</div>
                  </Link>
                </li>
              ))}
              {recent.length === 0 && <li className="text-sm" style={{ color: "var(--muted)" }}>Nothing filed yet.</li>}
            </ul>
          </section>
        </div>

        <aside className="grid gap-8 content-start">
          <section>
            <h2 className="text-sm font-medium mb-3" style={{ color: "var(--muted)" }}>Courses</h2>
            <ul className="grid gap-1.5">
              {cs.map((c) => (
                <li key={c.name}>
                  <Link href={`/courses/${encodeURIComponent(c.name)}`} className="pressable flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--surface)]" style={{ ["--accent" as string]: c.hue }}>
                    <span className="w-2 h-2 rounded-full accent-bg" />
                    <span className="flex-1 truncate text-sm">{c.name}</span>
                    <span className="mono text-xs" style={{ color: "var(--faint)" }}>{c.noteCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-sm font-medium mb-3" style={{ color: "var(--muted)" }}>Study material</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>{mats.filter((m) => m.kind === "flashcards").length} decks · {mats.filter((m) => m.kind === "test").length} tests · {mats.filter((m) => m.kind === "review").length} reviews</p>
          </section>
          <section>
            <h2 className="text-sm font-medium mb-3" style={{ color: "var(--muted)" }}>New</h2>
            <ul className="grid gap-2 text-sm">
              {unread.map((n) => <li key={n.id} className="leading-snug">{n.title}<div className="mono text-[11px]" style={{ color: "var(--faint)" }}>{ago(n.time)}</div></li>)}
              {unread.length === 0 && <li style={{ color: "var(--muted)" }}>You're caught up.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function time(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function ago(iso: string) { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; }
