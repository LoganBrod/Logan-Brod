import Link from "next/link";
import { headers } from "next/headers";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { allAssessments, studyPlan, courses, idToSlug, type Assessment } from "@/lib/vault";
import { calendarKey } from "@/lib/auth";

const TEST = ["test", "quiz", "project"];
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function Calendar({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, mo] = /^\d{4}-\d{2}$/.test(m ?? "") ? (m as string).split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1];
  const first = new Date(y, mo - 1, 1), last = new Date(y, mo, 0);
  const prev = `${first.getMonth() === 0 ? y - 1 : y}-${String(first.getMonth() === 0 ? 12 : first.getMonth()).padStart(2, "0")}`;
  const next = `${first.getMonth() === 11 ? y + 1 : y}-${String(first.getMonth() === 11 ? 1 : first.getMonth() + 2).padStart(2, "0")}`;
  const [items, plan, cs, ckey, h] = await Promise.all([allAssessments(), studyPlan(), courses(), calendarKey(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3210";
  const feed = `webcal://${host}/api/calendar${ckey ? `?key=${ckey}` : ""}`;

  const byDay = new Map<string, Assessment[]>();
  for (const a of items) byDay.set(a.when, [...(byDay.get(a.when) ?? []), a]);
  const sessByDay = new Map<string, typeof plan>();
  for (const s of plan) { const k = key(new Date(s.start)); sessByDay.set(k, [...(sessByDay.get(k) ?? []), s]); }
  const known = new Set(cs.map((c) => c.name));
  const short = (course: string) => course.split(/[:·]/)[0].replace(/\b(AP|Honors|Adv\.)\s+/g, "").trim().slice(0, 14);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, mo - 1, d));
  while (cells.length % 7) cells.push(null);
  const monthItems = items.filter((a) => a.when.startsWith(`${y}-${String(mo).padStart(2, "0")}`));
  const link = (a: Assessment) => TEST.includes(a.kind) ? `/study/${idToSlug(a.id)}` : known.has(a.course) ? `/courses/${encodeURIComponent(a.course)}` : a.url ?? "#";

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">{first.toLocaleDateString([], { month: "long", year: "numeric" })}</h1>
        <div className="flex items-center gap-1">
          <Link href={`/calendar?m=${prev}`} className="pressable card-2 p-2" aria-label="Previous month"><CaretLeft size={16} /></Link>
          <Link href="/calendar" className="pressable card-2 px-3 py-1.5 text-sm">Today</Link>
          <Link href={`/calendar?m=${next}`} className="pressable card-2 p-2" aria-label="Next month"><CaretRight size={16} /></Link>
        </div>
      </div>

      <div className="hidden md:grid grid-cols-7 gap-px rounded-2xl overflow-hidden" style={{ background: "var(--line)", border: "1px solid var(--line)" }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-3 py-2 text-[11px] uppercase tracking-[0.14em]" style={{ background: "var(--bg)", color: "var(--faint)" }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          const k = d ? key(d) : `x${i}`;
          const due = d ? byDay.get(k) ?? [] : [], sess = d ? sessByDay.get(k) ?? [] : [];
          const isToday = d && key(d) === key(today);
          const past = d ? d < today : false;
          return (
            <div key={k} className="min-h-28 p-2" style={{ background: d ? "var(--bg)" : "transparent", opacity: past ? 0.6 : 1 }}>
              {d && (
                <div className={`mono text-xs mb-1.5 inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "accent-bg font-semibold" : ""}`} style={isToday ? {} : { color: "var(--muted)" }}>{d.getDate()}</div>
              )}
              <ul className="grid gap-1">
                {due.slice(0, 4).map((a) => (
                  <li key={a.id}>
                    <Link href={link(a)} title={`${a.course}: ${a.title}`} className={`block rounded-md px-1.5 py-1 text-[11px] leading-tight truncate ${TEST.includes(a.kind) ? "accent-bg font-medium" : "card-2"}`}>
                      <span className="opacity-70">{short(a.course)} · </span>{a.title}
                    </Link>
                  </li>
                ))}
                {sess.slice(0, 2).map((s) => (
                  <li key={s.start}>
                    <Link href={`/study/${idToSlug(s.id)}`} className="block rounded-md px-1.5 py-1 text-[11px] leading-tight truncate accent-tint accent-ring">
                      <span className="mono">{new Date(s.start).toLocaleTimeString([], { hour: "numeric" })}</span> study {short(s.course)}
                    </Link>
                  </li>
                ))}
                {due.length > 4 && <li className="text-[11px] px-1.5" style={{ color: "var(--faint)" }}>+{due.length - 4} more</li>}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Phone: the month as a list, one row per day that has something */}
      <div className="md:hidden grid gap-2">
        {monthItems.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>Nothing on Schoology this month.</p>}
        {[...new Set(monthItems.map((a) => a.when))].map((day) => {
          const d = new Date(day + "T12:00:00");
          return (
            <div key={day} className="card p-3" style={{ opacity: d < today ? 0.6 : 1 }}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="mono text-lg font-semibold">{d.getDate()}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{d.toLocaleDateString([], { weekday: "long" })}</span>
              </div>
              <ul className="grid gap-1.5">
                {(byDay.get(day) ?? []).map((a) => (
                  <li key={a.id}><Link href={link(a)} className={`block rounded-lg px-2 py-1.5 text-xs leading-snug ${TEST.includes(a.kind) ? "accent-bg font-medium" : "card-2"}`}><span className="opacity-70">{a.course} · </span>{a.title}</Link></li>
                ))}
                {(sessByDay.get(day) ?? []).map((s) => (
                  <li key={s.start}><Link href={`/study/${idToSlug(s.id)}`} className="block rounded-lg px-2 py-1.5 text-xs accent-tint accent-ring"><span className="mono">{new Date(s.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> study {s.course}</Link></li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <section className="card p-4 md:p-5 max-w-3xl">
        <h2 className="text-sm font-medium mb-1">On your phone's calendar</h2>
        <p className="text-sm mb-2" style={{ color: "var(--muted)" }}>Subscribe once and every assignment, test and study session shows up in Apple Calendar or Google Calendar and stays in sync.</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>Mac: Calendar → File → New Calendar Subscription → paste this. iPhone: Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar.</p>
        <code className="mono block mt-2 text-xs break-all select-all rounded-lg px-3 py-2" style={{ background: "var(--glass-2)" }}>{feed}</code>
        {host.startsWith("localhost") && <p className="text-xs mt-2" style={{ color: "var(--faint)" }}>This address only works on this computer while the dashboard runs. The Vercel copy gives one that works anywhere.</p>}
      </section>
    </div>
  );
}
