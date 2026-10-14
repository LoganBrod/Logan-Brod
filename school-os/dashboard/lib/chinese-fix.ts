// The Chinese fixer. Claude corrects grammar under hard rules, and every answer is checked
// against the student's lexicon before anyone sees it. Anything it brought in that is not in
// the student's material goes back with a "replace these" note, up to three tries, and whatever
// still fails is shown as failing, never quietly accepted.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { store } from "./store";
import {
  check, newViolations, parseList, vocabulary, learnedStructures, listWithWord, LIST_TEMPLATE,
  type Lexicon, type StudentList, type CheckResult,
} from "./chinese";

const LEX = "04 System/chinese-lexicon.json";
const LIST = "04 System/Chinese list.md";
const MODEL = process.env.MODEL_CHAT || "claude-sonnet-5";

export async function loadChinese(): Promise<{ lex: Lexicon | null; list: StudentList; listText: string }> {
  let lex: Lexicon | null = null;
  try { lex = JSON.parse(await store.readFile(LEX)); } catch {}
  let listText = "";
  try { listText = await store.readFile(LIST); } catch {}
  return { lex, list: parseList(listText), listText };
}

export async function allowWord(word: string): Promise<void> {
  const { listText } = await loadChinese();
  await store.writeFile(LIST, listWithWord(listText || LIST_TEMPLATE, word.trim()));
}

export type Change = { original: string; corrected: string; why: string };
export type FixResult = {
  corrected: string; changes: Change[]; note: string;
  verified: boolean; violations: { words: string[]; structures: string[] };
  attempts: number; result: CheckResult;
};

const SUBMIT: Anthropic.Tool = {
  name: "submit_correction",
  description: "Submit the corrected Chinese text.",
  input_schema: {
    type: "object",
    properties: {
      corrected: { type: "string", description: "The student's text with the fixes applied, nothing else." },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            original: { type: "string" }, corrected: { type: "string" },
            why: { type: "string", description: "One short sentence in English, naming the rule or structure." },
          },
          required: ["original", "corrected", "why"], additionalProperties: false,
        },
      },
      note: { type: "string", description: "Anything you could not fix within the allowed words and structures, in English. Empty if none." },
    },
    required: ["corrected", "changes", "note"], additionalProperties: false,
  },
};

export async function fixChinese(text: string, lex: Lexicon, list: StudentList): Promise<FixResult> {
  const vocab = vocabulary(lex, list);
  const structures = learnedStructures(lex, list);
  const system: Anthropic.TextBlockParam[] = [{
    type: "text",
    cache_control: { type: "ephemeral" },
    text: `You correct a high-school student's Chinese writing. The student may only be marked on what their class has taught, so you work under hard rules that a program checks after you answer.

RULES
1. Fix real errors: word order, measure words, particles (了 过 着 的 地 得), wrong structure use, wrong word choice, missing or extra words. Keep the student's meaning, voice and level. Make the smallest change that is correct.
2. Every word you add must come from ALLOWED WORDS below, or already be in the student's text. Never add any other word, even a common one.
3. Every grammar structure you add must come from ALLOWED STRUCTURES below, or already be in the student's text. Basic sentence order, 的, 了, 吗, 呢, 很, 也, 都, 不, 没 are always fine.
4. If a fix would need a word or structure that is not allowed, leave that part as the student wrote it and explain in "note" what is wrong and why you could not fix it with what they have learned.
5. Do not rewrite for style. Correct sentences stay exactly as they are.
6. Explanations in English, one sentence each.

ALLOWED STRUCTURES
${structures.map((s) => `- ${s.name}: ${s.hint}`).join("\n") || "- (none detected; use only basic sentence order)"}

ALLOWED WORDS
${vocab.join(" ")}`,
  }];

  const client = new Anthropic();
  const history: Anthropic.MessageParam[] = [{ role: "user", content: `Student's text:\n\n${text}` }];
  let last: { corrected: string; changes: Change[]; note: string } = { corrected: text, changes: [], note: "" };
  let violations = { words: [] as string[], structures: [] as string[] };
  let attempts = 0;
  for (; attempts < 3; ) {
    attempts++;
    const res = await client.messages.create({
      model: MODEL, max_tokens: 4000, system, tools: [SUBMIT],
      tool_choice: { type: "tool", name: SUBMIT.name }, messages: history,
    });
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!call) break;
    const input = call.input as { corrected?: string; changes?: Change[]; note?: string };
    last = { corrected: String(input.corrected ?? text), changes: Array.isArray(input.changes) ? input.changes : [], note: String(input.note ?? "") };
    violations = newViolations(text, last.corrected, lex, list);
    if (!violations.words.length && !violations.structures.length) break;
    history.push({ role: "assistant", content: res.content });
    history.push({
      role: "user",
      content: [{
        type: "tool_result", tool_use_id: call.id, is_error: true,
        content: `Rejected by the checker. Not in the student's material: ${[
          violations.words.length ? `words ${violations.words.join(", ")}` : "",
          violations.structures.length ? `structures ${violations.structures.join(", ")}` : "",
        ].filter(Boolean).join("; ")}. Replace each with something from ALLOWED WORDS / ALLOWED STRUCTURES, or keep the student's original wording there and say so in note. Submit again.`,
      }],
    });
  }
  return {
    ...last, attempts, violations,
    verified: !violations.words.length && !violations.structures.length,
    result: check(last.corrected, lex, list),
  };
}
