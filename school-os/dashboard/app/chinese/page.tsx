import { loadChinese } from "@/lib/chinese-fix";
import { learnedStructures } from "@/lib/chinese";
import { ChineseChecker } from "@/components/ChineseChecker";

export const dynamic = "force-dynamic";

export default async function Chinese() {
  const { lex, list } = await loadChinese();
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
    </div>
  );
}
