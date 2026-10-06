// Files the brain has already downloaded for a course (slides, handouts, past tests), so the
// notebook can open them without an upload. Reads the real folder, so this is the Mac's copy only.
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { MODE, VAULT } from "@/lib/store";
import { courses } from "@/lib/vault";

const OK = /\.(pdf|png|jpe?g|webp)$/i;

export async function GET(req: Request) {
  const course = new URL(req.url).searchParams.get("course") ?? "";
  if (MODE === "cloud") return NextResponse.json({ files: [], cloud: true });
  if (!(await courses()).some((c) => c.name === course)) return NextResponse.json({ files: [] });
  const root = path.join(VAULT, "01 Courses", course);
  const files: { rel: string; name: string; unit: string; size: number }[] = [];
  async function walk(dir: string, depth: number) {
    let entries: import("node:fs").Dirent[] = [];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 3 && !e.name.startsWith(".")) await walk(full, depth + 1); continue; }
      if (!OK.test(e.name)) continue;
      const st = await fs.stat(full);
      const unit = path.relative(root, dir).split(path.sep).filter((p) => p && p !== "_sources")[0] ?? "";
      files.push({ rel: path.relative(VAULT, full).split(path.sep).join("/"), name: e.name, unit, size: st.size });
    }
  }
  await walk(root, 0);
  files.sort((a, b) => a.unit.localeCompare(b.unit) || a.name.localeCompare(b.name));
  return NextResponse.json({ files });
}
