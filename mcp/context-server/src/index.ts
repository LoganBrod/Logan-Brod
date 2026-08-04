#!/usr/bin/env node
/**
 * context-server — exposes memory/ to an MCP client as structured tools.
 *
 * Transport is stdio: the client launches this file as a child process and
 * speaks JSON-RPC over its stdin/stdout. There is no port and no listener, so
 * nothing on the network can reach it and there is no auth layer to get wrong
 * — the OS process boundary is the security boundary.
 *
 * The one consequence that bites people: stdout is the wire. Anything printed
 * there that is not a JSON-RPC message corrupts the protocol, so all logging
 * goes to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { memoryRoot } from "./paths.js";
import {
  searchMemory,
  appendToMemoryFile,
  today,
  MemoryMissingError,
} from "./memory.js";

/**
 * A calendar date, or "n/a".
 *
 * The regex alone is not enough: "2026-02-30" and "2026-13-01" both match the
 * shape and are not dates. Re-formatting the parsed Date and comparing it back
 * to the input rejects anything JavaScript silently rolled over into the next
 * month.
 */
const dateOrNa = z
  .string()
  .trim()
  .refine(
    (v) => {
      if (v.toLowerCase() === "n/a") return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const [y, m, d] = v.split("-").map(Number) as [number, number, number];
      const parsed = new Date(y, m - 1, d);
      return (
        parsed.getFullYear() === y &&
        parsed.getMonth() === m - 1 &&
        parsed.getDate() === d
      );
    },
    { message: 'Must be a real calendar date as YYYY-MM-DD, or "n/a".' },
  );

const DECISIONS_HEADER =
  "# Decisions\n\nAppend-only log. Newest entries at the bottom.\n\n---\n";

const QUESTIONS_HEADER =
  "# Open Questions\n\nThings to resolve. Append new questions at the bottom.\n\n---\n";

const server = new McpServer({
  name: "context-server",
  version: "0.1.0",
});

/**
 * Turn a thrown error into a tool result rather than a crash.
 *
 * isError tells the model the call failed while still handing it the reason,
 * so it can correct itself. Letting the exception escape would instead kill
 * the process and take the whole session's memory access with it.
 */
function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

server.registerTool(
  "search_context",
  {
    title: "Search memory",
    description:
      "Full-text search across all markdown notes in memory/. Returns matching " +
      "lines with their file and line number. Use this before answering " +
      "anything about Logan's businesses, decisions or open questions.",
    inputSchema: {
      // zod validates at *runtime*. TypeScript types are erased at compile
      // time and cannot help here: the arguments arrive as JSON from another
      // process, so the only thing standing between a malformed call and the
      // handler is this schema.
      query: z
        .string()
        .trim()
        .min(2, "Query must be at least 2 characters.")
        .max(200, "Query is too long.")
        .describe("Text to search for. Matched literally, case-insensitive."),
      max_results: z
        .number()
        .int()
        .positive()
        .max(200)
        .default(50)
        .describe("Maximum number of matching lines to return."),
    },
  },
  async ({ query, max_results }) => {
    try {
      const matches = await searchMemory(query, { maxResults: max_results });

      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              // An empty result is a valid answer, not an error. Saying so
              // explicitly stops the model inventing a plausible memory.
              text:
                `No matches for "${query}" in memory/.\n\n` +
                `Nothing is recorded on this. Do not infer an answer — ask, ` +
                `or record it with add_open_question.`,
            },
          ],
        };
      }

      const rendered = matches
        .map((m) => `${m.file}:${m.line}\n${m.context.join("\n")}`)
        .join("\n\n---\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `${matches.length} match(es) for "${query}":\n\n${rendered}`,
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  "log_decision",
  {
    title: "Log a decision",
    description:
      "Append a dated entry to memory/decisions.md recording a decision, why " +
      "it was made, and when to revisit it. Use when Logan settles something " +
      "that future sessions should not re-litigate. Appends only — this can " +
      "never modify or remove an existing entry.",
    inputSchema: {
      decision: z
        .string()
        .trim()
        .min(3, "Say what was decided.")
        .max(300, "Keep the decision to one line; put detail in reasoning.")
        .describe("The decision, in one line."),
      reasoning: z
        .string()
        .trim()
        .min(3, "Say why.")
        .max(4000)
        .describe("Why this was decided, including what was traded away."),
      revisit_by: dateOrNa
        .default("n/a")
        .describe('When to revisit, as YYYY-MM-DD, or "n/a".'),
    },
  },
  async ({ decision, reasoning, revisit_by }) => {
    try {
      const date = today();
      const entry =
        `\n## ${date} — ${decision}\n` +
        `**Reasoning:** ${reasoning}\n` +
        `**Revisit by:** ${revisit_by}\n`;

      const { created } = await appendToMemoryFile(
        "decisions.md",
        entry,
        DECISIONS_HEADER,
      );

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Logged to memory/decisions.md${created ? " (file created)" : ""}:\n\n` +
              `${date} — ${decision}\nRevisit by: ${revisit_by}`,
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

server.registerTool(
  "add_open_question",
  {
    title: "Add an open question",
    description:
      "Append an unresolved question to memory/open-questions.md. Use this " +
      "when something about Logan's businesses is unknown — record the gap " +
      "rather than guessing at an answer. Appends only.",
    inputSchema: {
      question: z
        .string()
        .trim()
        .min(5, "Write the question out.")
        .max(300)
        .describe("The open question, in one line."),
      context: z
        .string()
        .trim()
        .max(2000)
        .default("")
        .describe("Why this is blocking or unclear. Optional but useful."),
    },
  },
  async ({ question, context }) => {
    try {
      const date = today();
      const entry =
        `\n- [ ] ${date} — ${question}\n` +
        (context ? `  **Context:** ${context}\n` : "");

      const { created } = await appendToMemoryFile(
        "open-questions.md",
        entry,
        QUESTIONS_HEADER,
      );

      return {
        content: [
          {
            type: "text" as const,
            text:
              `Added to memory/open-questions.md${created ? " (file created)" : ""}:\n\n` +
              `[ ] ${date} — ${question}`,
          },
        ],
      };
    } catch (err) {
      return toolError(err);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`context-server ready. memory root: ${memoryRoot()}`);
}

main().catch((err) => {
  if (err instanceof MemoryMissingError) {
    console.error(err.message);
  } else {
    console.error("context-server failed to start:", err);
  }
  process.exit(1);
});
