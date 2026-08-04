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
import { searchMemory, MemoryMissingError } from "./memory.js";

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
