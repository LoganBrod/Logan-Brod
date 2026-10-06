"use client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import type { ReactNode } from "react";

/** Renders a vault note: GFM markdown, [[wikilinks]] as links, > [!answer]- callouts as collapsibles. */
export function Markdown({ body, links = {} }: { body: string; links?: Record<string, string | null> }) {
  const text = body.replace(/\[\[([^\]]+)\]\]/g, (_m, inner: string) => {
    const [target, alias] = inner.split("|");
    const rel = links[target.trim()];
    return rel ? `[${alias ?? target}](/note/${encodeURI(rel)})` : `**${alias ?? target}**`;
  });
  return (
    <div className="prose-note">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => href?.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href} target="_blank" rel="noreferrer">{children}</a>,
          blockquote: ({ children }) => <Callout>{children}</Callout>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: ReactNode } }).props.children);
  return "";
}

function Callout({ children }: { children: ReactNode }) {
  const raw = textOf(children);
  const m = raw.match(/^\s*\[!(\w+)\]([-+]?)\s*([^\n]*)/);
  if (!m) return <blockquote>{children}</blockquote>;
  const title = m[3] || m[1];
  const rest = raw.replace(/^\s*\[!\w+\][-+]?[^\n]*\n?/, "").trim();
  return (
    <details className="answer" open={m[2] === "+"}>
      <summary>{title}</summary>
      <div className="whitespace-pre-wrap">{rest}</div>
    </details>
  );
}
