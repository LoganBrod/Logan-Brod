import Link from "next/link";
import { assessments, studyPlan, courses, idToSlug } from "@/lib/vault";

export default async function Week() {
  const [as, plan, cs] = await Promise.all([assessments(), studyPlan(), courses()]);
  const hue = (course: string) => cs.find((c) => c.name === course)?.hue ?? 250;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">This week</h1>
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((d) => {
          const k = key(d);
          const due = as.filter((a) => a.when === k);
          const sess = plan.filter((s) => key(new Date(s.start)) === k);
          return (
            <div key={k} className="card p-3 min-h-32">
              <div className="flex items-baseline justify-between">
                <span className="text-xs" style={{ color: "var(--muted)" }}>{d.toLocaleDateString([], { weekday: "short" })}</span>
                <span className="mono text-lg font-semibold">{d.getDate()}</span>
              </div>
              <ul className="mt-2 grid gap-1.5">
                {due.map((a) => (
                  <li key={a.id} style={{ ["--accent" as string]: hue(a.course) }}>
                    <Link href={["test", "quiz", "project"].includes(a.kind) ? `/study/${idToSlug(a.id)}` : `/courses/${encodeURIComponent(a.course)}`} className={`block rounded-lg px-2 py-1.5 text-xs leading-snug ${["test", "quiz", "project"].includes(a.kind) ? "accent-bg font-medium" : "card-2"}`}>
                      {a.title}
                    </Link>
                  </li>
                ))}
                {sess.map((s) => (
                  <li key={s.start} style={{ ["--accent" as string]: hue(s.course) }}>
                    <Link href={`/study/${idToSlug(s.id)}`} className="block rounded-lg px-2 py-1.5 text-xs accent-tint accent-ring">
                      <span className="mono">{new Date(s.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> {s.course}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: "var(--faint)" }}>Solid blocks are tests, quizzes and projects. Outlined blocks are booked study sessions. Plain blocks are other assignments due.</p>
    </div>
  );
}
