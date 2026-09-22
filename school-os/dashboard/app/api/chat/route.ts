import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs/promises";
import { config as loadEnv } from "dotenv";
import { tools, runTool } from "@/lib/tools";
import { courses, tests, brief, VAULT } from "@/lib/vault";

loadEnv({ path: path.join(process.cwd(), "..", ".env") });
export const maxDuration = 300;

const MODEL = process.env.MODEL_CHAT || "claude-sonnet-5";

export async function POST(req: Request) {
  const { messages, voice } = (await req.json()) as { messages: { role: "user" | "assistant"; content: string }[]; voice?: boolean };
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set in school-os/.env" }, { status: 500 });

  const [cs, ts, b] = await Promise.all([courses(), tests(), brief()]);
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: `You are the student's school assistant. You have their notes, teacher materials, Schoology deadlines, study plan and study material, through tools. Be direct and specific. Plain text, short paragraphs, no emojis, no em-dashes. Use markdown lists and headings only when they help.

Ground everything in the notes: when asked for problems, examples or explanations, search and read the notes first and quote or reproduce what is actually there, naming the note it came from. Say plainly when the notes do not cover something, then help from general knowledge and label it as such.

Course names are loose in speech ("calc" means the pre-calculus course). Resolve them with list_courses. Search with several phrasings when a concept has synonyms or a formula has a name. When the student asks for "problems", pull the actual problems, numbered, with the source note, and offer to work through one.

For any question about a specific test or quiz ("what do I need to know", "what's on it", "help me study for Thursday"), call test_scope first and answer from the teacher's description and the in-scope notes only. Structure the answer by the parts the teacher listed. Do not bring in other units or general knowledge unless the student asks, and if you do, say so. If the description is empty and the notes are thin, say exactly that rather than guessing.

When the student says "pull up", "show me" or "open", use open_page and then answer in one short sentence; the screen does the rest.

Making material or running jobs costs money and time; do it when asked, and say what you are doing. Today is ${new Date().toDateString()}.${voice ? "\n\nThis message came by voice and the reply will be read aloud: answer in two to four spoken sentences, no markdown, no lists, unless the student asked for a list of problems." : ""}`,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: `Courses: ${cs.map((c) => `${c.name} (${c.noteCount} notes${c.units.length ? `; units: ${c.units.join(", ")}` : ""})`).join(" | ")}\nNext assessments: ${ts.slice(0, 5).map((t) => `${t.course} ${t.title} ${t.kind} ${t.when}`).join(" | ") || "none"}\nToday's brief: ${b?.date === new Date().toISOString().slice(0, 10) ? b.text.slice(0, 600) : "not written yet"}`,
    },
  ];

  const client = new Anthropic();
  const history: Anthropic.MessageParam[] = messages.slice(-30).map((m) => ({ role: m.role, content: m.content }));
  const steps: string[] = [];
  let navigate: string | null = null;
  let usage = { input: 0, output: 0 };

  for (let turn = 0; turn < 12; turn++) {
    const res = await client.messages.stream({ model: MODEL, max_tokens: 4000, system, tools, messages: history, output_config: { effort: "medium" } }).finalMessage();
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
    const dir = path.join(VAULT, "04 System", "chat");
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(path.join(dir, `${new Date().toISOString().slice(0, 10)}.md`), `\n### ${new Date().toLocaleTimeString()}\n**You:** ${q}\n\n${steps.length ? `_${steps.join(" · ")}_\n\n` : ""}${a}\n`);
  } catch { /* the log is a nicety */ }
}
