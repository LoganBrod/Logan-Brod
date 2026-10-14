// The Chinese checker's core: split text into words, compare them with a lexicon built from the
// student's own material, and detect grammar structures. Pure functions, no I/O and no model,
// so the same code runs in the brain (building the lexicon) and the dashboard (checking).

export const HAN = /[㐀-鿿]/;
const HAN_RUN = /[㐀-鿿]+/g;
const S = "[^。！？!?\\n]";   // within one sentence
const C = "[\\u3400-\\u9fff]"; // one character

export type Structure = { id: string; name: string; re: RegExp; hint: string };

/** Grammar structures a Chinese course teaches, from first year to AP. Detected by pattern. */
export const STRUCTURES: Structure[] = [
  ["suiran", "虽然…但是/可是", `虽然${S}*?(但是|可是|但|却)`, "although … but"],
  ["yinwei", "因为…所以", `因为${S}*?所以`, "because … so"],
  ["budan", "不但…而且", `不但${S}*?(而且|也|还)`, "not only … but also"],
  ["bujin", "不仅…而且", `不仅${S}*?(而且|也|还)`, "not only … but also"],
  ["ruguo", "如果…就", `(如果|要是)${S}*?就`, "if … then"],
  ["zhiyao", "只要…就", `只要${S}*?就`, "as long as"],
  ["zhiyou", "只有…才", `只有${S}*?才`, "only if"],
  ["yijiu", "一…就", `一(?![个些样起直定共点下边半天])${C}{1,4}就`, "as soon as"],
  ["yuelaiyue", "越来越", `越来越`, "more and more"],
  ["yueyue", "越…越", `越(?!来越)${C}{1,6}越`, "the more … the more"],
  ["ba", "把 sentence", `(?<![一两几这那每0-9])把${C}`, "把 + object + verb"],
  ["bei", "被 passive", `被${C}`, "passive with 被"],
  ["bi", "比 comparison", `${C}比(?!较|赛|如|方)${C}`, "A 比 B + adj"],
  ["meiyou", "没有…那么/这么", `没有${S}{1,8}?(那么|这么)`, "not as … as"],
  ["yiyang", "跟/和…一样", `(跟|和)${S}{1,10}?一样`, "the same as"],
  ["chule", "除了…以外", `除了${S}*?(以外|之外|都|也|还)`, "besides / except"],
  ["yibian", "一边…一边", `一边${S}*?一边`, "while (doing two things)"],
  ["you", "又…又", `又${C}{1,4}又`, "both … and"],
  ["xian", "先…然后/再", `先${S}*?(然后|再)`, "first … then"],
  ["de_comp", "V得 + complement", `${C}得(很|非常|太|特别|真|不|好|快|慢|多)`, "degree complement with 得"],
  ["potential", "V得/不 + 了/完/到/懂", `${C}(得|不)(了|完|到|懂|见|起|动|下)(?!解|字)`, "potential complement"],
  ["direction", "V起来/下去/出来", `${C}(起来|下去|出来|过来|上来|下来)`, "directional complement"],
  ["zhengzai", "正在…(呢)", `正在`, "in the middle of"],
  ["kuaiyao", "快要/就要…了", `(快要|就要)${S}{1,8}?了`, "about to"],
  ["lian", "连…都/也", `连${S}{1,8}?(都|也)`, "even"],
  ["jishi", "即使…也", `即使${S}*?也`, "even if"],
  ["wulun", "无论/不管…都", `(无论|不管)${S}*?(都|也)`, "no matter"],
  ["jiran", "既然…就", `既然${S}*?就`, "since (given that)"],
  ["chufei", "除非…否则/才", `除非${S}*?(否则|才|不然)`, "unless"],
  ["jinguan", "尽管…还是/却", `尽管${S}*?(还是|却|但是|可是)`, "despite"],
  ["youyu", "由于…因此", `由于${S}*?(因此|所以)`, "due to … therefore"],
  ["weile", "为了", `为了`, "in order to"],
  ["duilaishuo", "对…来说", `对${S}{1,8}?来说`, "as far as … is concerned"],
  ["kanlai", "在…看来", `在${S}{1,8}?看来`, "in … view"],
  ["yeduobu", "一…也/都不", `一${C}{0,3}(也|都)(不|没)`, "not a single"],
  ["wh_dou", "什么/谁/哪儿 + 都/也", `(什么|谁|哪儿|哪里|怎么)(都|也)`, "question word + 都 = every / none"],
  ["anota", "A不A question", `(${C})不\\1`, "是不是 / 好不好"],
  ["shihou", "…的时候", `的时候`, "when"],
  ["yihou", "…以后/以前", `${C}(以后|以前|之后|之前)`, "after / before"],
  ["bushi_ershi", "不是…而是", `不是${S}*?而是`, "not … but rather"],
  ["yuqi", "与其…不如", `与其${S}*?不如`, "rather than"],
  ["ningke", "宁可…也", `宁可${S}*?也`, "would rather"],
  ["zhisuoyi", "之所以…是因为", `之所以${S}*?是因为`, "the reason … is that"],
  ["yifangmian", "一方面…另一方面", `一方面${S}*?另一方面`, "on one hand … on the other"],
  ["shouxian", "首先…其次", `首先[\\s\\S]*?(其次|然后|最后)`, "first … second"],
  ["zongzhi", "总之 / 总的来说", `(总之|总的来说|总而言之)`, "in summary"],
  ["shi_de", "是…的 (past detail)", `是${C}{1,8}?(来|去|做|买|写|学|坐|开)的`, "stressing when/how/where"],
  ["guo", "V过 (experience)", `${C}过(?![去来年])`, "have done before"],
  ["zhe", "V着 (ongoing state)", `${C}着(?![急])`, "continuous state"],
  ["haishi", "还是 (or, in questions)", `还是${S}*?[？?]`, "A 还是 B?"],
  ["huozhe", "或者", `或者`, "or (statements)"],
  ["suoyi_alone", "所以", `所以`, "so / therefore"],
  ["keshi", "可是/但是", `(可是|但是)`, "but"],
  ["erqie", "而且", `而且`, "moreover"],
].map(([id, name, re, hint]) => ({ id, name, re: new RegExp(re, "u"), hint }));

// ---- lexicon ----
export type Lexicon = {
  v: 1;
  generated: string;
  sources: string[];                          // file names, for "learned in …"
  words: Record<string, [number, number]>;    // word → [count, first source index]
  chars: string;                              // every character seen, as one string
  structures: Record<string, [number, number]>;
};

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("zh", { granularity: "word" }) : null;

/** Every segment of the text in order, with whether it contains Chinese. */
export function segments(text: string): { text: string; han: boolean }[] {
  if (!segmenter) return [...text].map((ch) => ({ text: ch, han: HAN.test(ch) }));
  const out: { text: string; han: boolean }[] = [];
  for (const s of segmenter.segment(text)) {
    // Split mixed tokens like "3个" so only Chinese runs are judged.
    let last = 0;
    for (const m of s.segment.matchAll(HAN_RUN)) {
      if (m.index! > last) out.push({ text: s.segment.slice(last, m.index), han: false });
      out.push({ text: m[0], han: true });
      last = m.index! + m[0].length;
    }
    if (last < s.segment.length) out.push({ text: s.segment.slice(last), han: false });
  }
  return out;
}

export function detectStructures(text: string): { id: string; name: string; hint: string; match: string }[] {
  const out: { id: string; name: string; hint: string; match: string }[] = [];
  for (const s of STRUCTURES) { const m = text.match(s.re); if (m) out.push({ id: s.id, name: s.name, hint: s.hint, match: m[0].slice(0, 24) }); }
  return out;
}

export function emptyLexicon(): Lexicon {
  return { v: 1, generated: new Date().toISOString(), sources: [], words: {}, chars: "", structures: {} };
}

/** Adds one file's text to the lexicon. */
export function addToLexicon(lex: Lexicon, text: string, source: string) {
  const src = lex.sources.push(source) - 1;
  const chars = new Set(lex.chars);
  for (const seg of segments(text)) {
    if (!seg.han) continue;
    const w = lex.words[seg.text];
    if (w) w[0]++; else lex.words[seg.text] = [1, src];
    for (const ch of seg.text) chars.add(ch);
  }
  lex.chars = [...chars].join("");
  for (const s of detectStructures(text)) {
    const st = lex.structures[s.id];
    if (st) st[0]++; else lex.structures[s.id] = [1, src];
  }
}

// ---- the student's own list ----
export type StudentList = { allowWords: Set<string>; allowStructures: Set<string>; blockStructures: Set<string>; skipUnits: Set<string> };

export const LIST_TEMPLATE = `# Chinese list

Your own corrections to what the checker counts as learned. One item per line, starting with "- ".
The checker reads this every time; nothing here is ever overwritten.

## Allow words
Words you have learned that are not in your files (or that the checker missed).

## Allow structures
Grammar structures you have learned, by name as the checker shows them, e.g. "- 把 sentence".

## Block structures
Structures the checker found in your files that you have NOT learned yet, so it never uses them.

## Skip units
Unit folders to leave out of the index, e.g. a unit the teacher posted early that you have not done.
`;

export function parseList(md: string): StudentList {
  const list: StudentList = { allowWords: new Set(), allowStructures: new Set(), blockStructures: new Set(), skipUnits: new Set() };
  let section: keyof StudentList | null = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      const t = h[1].toLowerCase();
      section = t.startsWith("allow word") ? "allowWords" : t.startsWith("allow struct") ? "allowStructures" : t.startsWith("block") ? "blockStructures" : t.startsWith("skip") ? "skipUnits" : null;
      continue;
    }
    const item = line.match(/^\s*[-*]\s+(.+?)\s*$/)?.[1];
    if (!item || !section) continue;
    if (section === "allowStructures" || section === "blockStructures") {
      const s = STRUCTURES.find((x) => x.id === item || x.name === item || x.name.startsWith(item));
      list[section].add(s ? s.id : item);
    } else list[section].add(item);
  }
  return list;
}

/** The list file with one more allowed word. */
export function listWithWord(md: string, word: string): string {
  const base = md.trim() ? md : LIST_TEMPLATE;
  if (parseList(base).allowWords.has(word)) return base;
  const lines = base.split("\n");
  const at = lines.findIndex((l) => /^##\s+allow words/i.test(l));
  if (at < 0) return `${base.trimEnd()}\n\n## Allow words\n- ${word}\n`;
  let end = at + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end++;
  while (end > at + 1 && lines[end - 1].trim() === "") end--;
  lines.splice(end, 0, `- ${word}`);
  return lines.join("\n");
}

// ---- checking ----
export type TokenStatus = "known" | "new" | "unknown" | "other";
export type Token = { text: string; status: TokenStatus; unknownChars?: string; learnedIn?: string };
export type StructureHit = { id: string; name: string; hint: string; match: string; learned: boolean; learnedIn?: string };
export type CheckResult = { tokens: Token[]; structures: StructureHit[]; flagged: { word: string; status: "new" | "unknown"; unknownChars?: string }[]; han: number };

/** Can this run of characters be split entirely into known words? Longest pieces first. */
function covers(run: string, known: (w: string) => boolean): boolean {
  if (run.length > 16) return false;
  const ok: boolean[] = new Array(run.length + 1).fill(false);
  ok[0] = true;
  for (let i = 0; i < run.length; i++) {
    if (!ok[i]) continue;
    for (let j = Math.min(run.length, i + 6); j > i; j--) if (known(run.slice(i, j))) ok[j] = true;
  }
  return ok[run.length];
}

export function check(text: string, lex: Lexicon, list: StudentList): CheckResult {
  const chars = new Set(lex.chars);
  const isWord = (w: string) => w in lex.words || list.allowWords.has(w);
  const tokens: Token[] = [];
  const flagged = new Map<string, { word: string; status: "new" | "unknown"; unknownChars?: string }>();
  let han = 0;
  for (const seg of segments(text)) {
    if (!seg.han) { tokens.push({ text: seg.text, status: "other" }); continue; }
    han += seg.text.length;
    if (isWord(seg.text)) { const w = lex.words[seg.text]; tokens.push({ text: seg.text, status: "known", learnedIn: w ? lex.sources[w[1]] : "your list" }); continue; }
    // A single character already seen in the material counts, even if it only ever appeared inside a longer word.
    if (seg.text.length === 1 && chars.has(seg.text)) { tokens.push({ text: seg.text, status: "known" }); continue; }
    // Glued pieces ("很喜欢", "吃了"): known when it splits entirely into known words.
    if (covers(seg.text, isWord)) { tokens.push({ text: seg.text, status: "known" }); continue; }
    const missing = [...new Set([...seg.text].filter((ch) => !chars.has(ch) && !list.allowWords.has(ch)))].join("");
    const status: "new" | "unknown" = missing ? "unknown" : "new";
    tokens.push({ text: seg.text, status, unknownChars: missing || undefined });
    if (!flagged.has(seg.text)) flagged.set(seg.text, { word: seg.text, status, unknownChars: missing || undefined });
  }
  const structures = detectStructures(text).map((s) => {
    const st = lex.structures[s.id];
    const learned = !list.blockStructures.has(s.id) && (!!st || list.allowStructures.has(s.id));
    return { ...s, learned, learnedIn: st ? lex.sources[st[1]] : list.allowStructures.has(s.id) ? "your list" : undefined };
  });
  return { tokens, structures, flagged: [...flagged.values()], han };
}

/** What a correction brought in that the student has not learned and did not write themselves. */
export function newViolations(original: string, corrected: string, lex: Lexicon, list: StudentList): { words: string[]; structures: string[] } {
  const before = check(original, lex, list), after = check(corrected, lex, list);
  const had = new Set(before.tokens.filter((t) => t.status !== "other").map((t) => t.text));
  const hadStruct = new Set(before.structures.map((s) => s.id));
  return {
    words: [...new Set(after.flagged.filter((f) => !had.has(f.word) && !original.includes(f.word)).map((f) => f.word))],
    structures: after.structures.filter((s) => !s.learned && !hadStruct.has(s.id)).map((s) => s.name),
  };
}

/** The vocabulary to show a model: most frequent first, capped. */
export function vocabulary(lex: Lexicon, list: StudentList, max = 5000): string[] {
  return [...Object.entries(lex.words).sort((a, b) => b[1][0] - a[1][0]).map(([w]) => w).slice(0, max), ...list.allowWords];
}

export function learnedStructures(lex: Lexicon, list: StudentList): Structure[] {
  return STRUCTURES.filter((s) => !list.blockStructures.has(s.id) && (s.id in lex.structures || list.allowStructures.has(s.id)));
}

/** Course folders that hold Chinese. CHINESE_COURSES (comma list) overrides the name match. */
export function isChineseCourse(name: string, override = ""): boolean {
  const list = override.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (list.length) return list.some((x) => name.toLowerCase().startsWith(x));
  return /chinese|mandarin|中文|汉语|華語|华语/i.test(name);
}
