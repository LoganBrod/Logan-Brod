import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { tools, runTool } from "@/lib/tools";
import { courses, tests, brief, persona, memory } from "@/lib/vault";
import { store } from "@/lib/store";
export const maxDuration = 300;

const MODEL = process.env.MODEL_CHAT || "claude-sonnet-5";

export async function POST(req: Request) {
  const { messages, voice } = (await req.json()) as { messages: { role: "user" | "assistant"; content: string }[]; voice?: boolean };
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set (school-os/.env on the computer, Environment Variables on Vercel)" }, { status: 500 });

  const [cs, ts, b, who, mem] = await Promise.all([courses(), tests(), brief(), persona(), memory()]);
  const name = process.env.USER_NAME || "";
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: `${who}

The student's name is ${name || "not set"}. You have their notes, teacher materials, Schoology deadlines, study plan and study material, through tools. Be direct and specific. Plain text, short paragraphs. Use markdown lists and headings only when they help, never in voice mode.

When the student tells you something worth keeping (a preference, a schedule fact, a goal, "remember that"), call remember once, quietly, and carry on.

Ground everything in the notes: when asked for problems, examples or explanations, search and read the notes first and quote or reproduce what is actually there, naming the note it came from. Say plainly when the notes do not cover something, then help from general knowledge and label it as such.

Course names are loose in speech ("calc" means the pre-calculus course). Resolve them with list_courses. Search with several phrasings when a concept has synonyms or a formula has a name. When the student asks for "problems", pull the actual problems, numbered, with the source note, and offer to work through one.

For any question about a specific test or quiz ("what do I need to know", "what's on it", "help me study for Thursday"), call test_scope first and answer from the teacher's description and the in-scope notes only. Structure the answer by the parts the teacher listed. Do not bring in other units or general knowledge unless the student asks, and if you do, say so. If the description is empty and the notes are thin, say exactly that rather than guessing.

When the student says "pull up", "show me" or "open", use open_page and then answer in one short sentence; the screen does the rest.

Making material or running jobs costs money and time; do it when asked, and say what you are doing. Today is ${new Date().toDateString()}.${voice ? `

VOICE MODE. The student is talking to you; the reply is spoken and only the first two sentences are heard. Speed matters.
- Reply in ONE or TWO short sentences, at most 30 words, plain speech, no markdown, no lists.
- Act before you speak: if there is a screen for it, call open_page, then say what you opened plus the single most useful thing.
- For a test: call test_scope with depth "summary" (never "full" in voice), open its study page, say what it covers and where to start.
- Never read lists, problems or note contents aloud. For problems, open the note and say how many there are.
- Use at most two tool calls unless the student asked for something that needs more. Do not call read_course_notes in voice.
- Anything longer that is genuinely useful goes AFTER a line containing only --- (shown on screen, not spoken), at most five short lines.
- Small talk is fine: answer like a companion, one sentence, and offer one useful thing.` : ""}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `${mem ? `Things you remember about the student:\n${mem}\n\n` : ""}Courses: ${cs.map((c) => `${c.name} (${c.noteCount} notes${c.units.length ? `; units: ${c.units.join(", ")}` : ""})`).join(" | ")}\nNext assessments: ${ts.slice(0, 5).map((t) => `${t.course} ${t.title} ${t.kind} ${t.when}`).join(" | ") || "none"}\nToday's brief: ${b?.date === new Date().toISOString().slice(0, 10) ? b.text.slice(0, 600) : "not written yet"}`,
    },
  ];

  const client = new Anthropic();
  const history: Anthropic.MessageParam[] = messages.slice(-30).map((m) => ({ role: m.role, content: m.content }));
  const steps: string[] = [];
  let navigate: string | null = null;
  let usage = { input: 0, output: 0 };

  const maxTurns = voice ? 6 : 12;
  for (let turn = 0; turn < maxTurns; turn++) {
    const res = await client.messages.stream({
      model: MODEL, max_tokens: voice ? 350 : 4000, system, tools, messages: history,
      output_config: { effort: voice ? "low" : "medium" },
    }).finalMessage();
    usage = { input: usage.input + res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0), output: usage.output + res.usage.output_tokens };
    history.push({ role: "assistant", content: res.content });
    if (res.stop_reason !== "tool_use") {
      const text = res.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      await log(messages.at(-1)?.content ?? "", text, steps, usage);
      return NextResponse.json({ text, steps, usage, navigate });
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      try {
        const { result, summary } = await runTool(block.name, block.input as Record<string, unknown>);
        steps.push(summary);
        if (block.name === "open_page") navigate = JSON.parse(result).navigate;
        results.push({ type: "tool_result", tool_use_id: block.id, content: result });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        steps.push(`${block.name} failed`);
        results.push({ type: "tool_result", tool_use_id: block.id, content: `error: ${msg}`, is_error: true });
      }
    }
    history.push({ role: "user", content: results });
  }
  return NextResponse.json({ text: "I got stuck in a loop of tool calls. Try asking in a smaller step.", steps, usage, navigate });
}

async function log(q: string, a: string, steps: string[], usage: { input: number; output: number }) {
  try {
    await store.appendFile(`04 System/chat/${new Date().toISOString().slice(0, 10)}.md`, `\n### ${new Date().toLocaleTimeString()}\n**You:** ${q}\n\n${steps.length ? `_${steps.join(" · ")}_\n\n` : ""}${a}\n`);
  } catch { /* the log is a nicety */ }
}
