// An iCalendar feed of every assignment, test and study session, for Apple Calendar or Google
// Calendar to subscribe to. Locked with ?key= when the dashboard has a password.
import { allAssessments, studyPlan } from "@/lib/vault";
import { calendarKey } from "@/lib/auth";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const fold = (line: string) => { const out: string[] = []; let s = line; while (s.length > 72) { out.push(s.slice(0, 72)); s = " " + s.slice(72); } out.push(s); return out.join("\r\n"); };
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export async function GET(req: Request) {
  const need = await calendarKey();
  const got = new URL(req.url).searchParams.get("key") ?? "";
  if (need && got !== need) return new Response("calendar key required", { status: 401 });

  const [items, plan] = await Promise.all([allAssessments(), studyPlan()]);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//School OS//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:School OS", "X-WR-TIMEZONE:" + (process.env.TZ || "UTC")];
  const now = stamp(new Date());
  for (const a of items) {
    const day = a.when.replace(/-/g, "");
    const next = new Date(a.when + "T00:00:00Z"); next.setUTCDate(next.getUTCDate() + 1);
    const kind = a.kind === "assignment" ? "Due" : a.kind[0].toUpperCase() + a.kind.slice(1);
    lines.push("BEGIN:VEVENT", `UID:school-os-${a.id}@school-os`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${stamp(next).slice(0, 8)}`,
      fold(`SUMMARY:${esc(`${kind}: ${a.title} (${a.course})`)}`),
      fold(`DESCRIPTION:${esc((a.description ?? "").slice(0, 800))}`),
      ...(a.url ? [fold(`URL:${a.url}`)] : []),
      `CATEGORIES:${esc(a.course)}`, "END:VEVENT");
  }
  for (const s of plan) {
    lines.push("BEGIN:VEVENT", `UID:school-os-study-${s.id}-${s.start}@school-os`, `DTSTAMP:${now}`, `DTSTART:${stamp(new Date(s.start))}`, `DTEND:${stamp(new Date(s.end))}`,
      fold(`SUMMARY:${esc(`Study: ${s.course} for ${s.title}`)}`), `CATEGORIES:${esc(s.course)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" } });
}
