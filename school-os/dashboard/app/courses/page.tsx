import Link from "next/link";
import { courses } from "@/lib/vault";

export default async function Courses() {
  const cs = await courses();
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cs.map((c) => (
          <li key={c.name}>
            <Link href={`/courses/${encodeURIComponent(c.name)}`} className="card pressable block p-5 hover:bg-[var(--surface-2)]" style={{ ["--accent" as string]: c.hue }}>
              <div className="w-8 h-1.5 rounded-full accent-bg" />
              <div className="mt-4 font-medium text-lg leading-tight">{c.name}</div>
              <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{c.noteCount} note{c.noteCount === 1 ? "" : "s"} · {c.units.length} unit{c.units.length === 1 ? "" : "s"}</div>
            </Link>
          </li>
        ))}
      </ul>
      {cs.length === 0 && <p style={{ color: "var(--muted)" }}>No courses found. Is VAULT_PATH set in school-os/.env?</p>}
    </div>
  );
}
