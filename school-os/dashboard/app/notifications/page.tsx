import Link from "next/link";
import { notifications } from "@/lib/vault";
import { MarkRead } from "@/components/MarkRead";

export default async function Notifications() {
  const list = await notifications();
  const unread = list.filter((n) => !n.read).map((n) => n.id);
  return (
    <div className="grid gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <MarkRead ids={unread} />
      </div>
      {list.length === 0 && <p style={{ color: "var(--muted)" }}>Nothing yet. Tests posted, files pulled and material generated all show up here.</p>}
      <ul className="grid gap-2">
        {list.slice(0, 100).map((n) => (
          <li key={n.id} className={`card p-4 flex gap-3 items-start ${n.read ? "opacity-60" : ""}`}>
            <span className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${n.read ? "" : "accent-bg"}`} />
            <div className="min-w-0">
              <div className="leading-snug">{n.link ? <Link href={linkFor(n.link)} className="hover:underline underline-offset-4">{n.title}</Link> : n.title}</div>
              <div className="mono text-[11px] mt-1" style={{ color: "var(--faint)" }}>{n.kind.replace("_", " ")} · {new Date(n.time).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
function linkFor(link: string) { return link.endsWith(".md") ? `/note/${encodeURI(link)}` : link.startsWith("03 Calendar") ? "/week" : "/courses"; }
