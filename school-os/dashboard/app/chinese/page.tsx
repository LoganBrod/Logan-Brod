import { loadChinese } from "@/lib/chinese-fix";
import { learnedStructures } from "@/lib/chinese";
import { ChineseChecker } from "@/components/ChineseChecker";
import { headers } from "next/headers";
import { chineseApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Chinese() {
  const { lex, list } = await loadChinese();
  const [key, h] = await Promise.all([chineseApiKey(), headers()]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const site = `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
  const stats = lex ? {
    files: lex.sources.length, words: Object.keys(lex.words).length, chars: [...lex.chars].length,
    structures: learnedStructures(lex, list).map((s) => s.name), built: lex.generated,
  } : null;
  return (
    <div className="grid gap-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Chinese checker</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
          {stats
            ? `Checks against ${stats.words.toLocaleString()} words, ${stats.chars.toLocaleString()} characters and ${stats.structures.length} structures from ${stats.files} of your files · built ${new Date(stats.built).toLocaleDateString([], { month: "short", day: "numeric" })}`
            : "No lexicon yet. On the Mac, run npm run chinese (sync does it on its own after that)."}
        </p>
      </div>
      <ChineseChecker ready={!!stats} learned={stats?.structures ?? []} canFix={!!process.env.ANTHROPIC_API_KEY} />
      <details className="card p-4 text-sm">
        <summary className="cursor-pointer font-medium">Use it inside Google Docs</summary>
        {key && !host.startsWith("localhost") ? (
          <div className="grid gap-2 mt-3" style={{ color: "var(--muted)" }}>
            <p>In the Google Doc: 中文 menu → Settings, then paste these two. The key only opens the Chinese checker, nothing else on this site.</p>
            <label className="grid gap-1"><span className="text-xs">Site address</span><code className="mono text-xs rounded-lg px-3 py-2 select-all" style={{ background: "var(--glass-2)", color: "var(--text)" }}>{site}</code></label>
            <label className="grid gap-1"><span className="text-xs">Key</span><code className="mono text-xs rounded-lg px-3 py-2 select-all break-all" style={{ background: "var(--glass-2)", color: "var(--text)" }}>{key}</code></label>
            <p>Setting up the add-on itself: README → "Chinese checker in Google Docs".</p>
          </div>
        ) : (
          <p className="mt-3" style={{ color: "var(--muted)" }}>Google Docs reaches the copy on Vercel, not this computer. Open this page on your Vercel site (it needs DASHBOARD_PASSWORD set there) to get the address and key.</p>
        )}
      </details>
    </div>
  );
}
