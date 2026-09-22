// Turns a file from the inbox into something Claude can read.
// Scans (PDF, JPG, PNG) go as documents/images so Claude reads the handwriting.
// Word files and text go as plain text.
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import JSZip from "jszip";
import type Anthropic from "@anthropic-ai/sdk";
import { readNote } from "./vault.js";

export type SourceKind = "scan" | "document" | "text";

export type Source = {
  path: string;
  kind: SourceKind;
  /** What we send to Claude. */
  block: Anthropic.ContentBlockParam;
  /** For text sources, the body we keep verbatim instead of Claude's transcription. */
  verbatimBody?: string;
  /** Frontmatter already on a markdown note (e.g. status: raw, gdoc_id). */
  existingFrontmatter?: Record<string, unknown>;
};

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const SUPPORTED = [".pdf", ...Object.keys(IMAGE_TYPES), ".docx", ".pptx", ".md", ".txt"];

/** Slide text out of a .pptx: one markdown section per slide, in order. */
async function pptxToMarkdown(p: string): Promise<string> {
  const zip = await JSZip.loadAsync(await fs.readFile(p));
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const out: string[] = [];
  for (const [i, name] of slides.entries()) {
    const xml = await zip.file(name)!.async("string");
    // Each <a:p> is a paragraph; each <a:t> a text run inside it.
    const paragraphs = [...xml.matchAll(/<a:p\b[\s\S]*?<\/a:p>/g)]
      .map((m) => [...m[0].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(""))
      .map((t) => t.trim())
      .filter(Boolean);
    if (paragraphs.length) out.push(`## Slide ${i + 1}\n\n${paragraphs.join("\n")}`);
  }
  return out.join("\n\n");
}

export async function readSource(p: string): Promise<Source | null> {
  const ext = path.extname(p).toLowerCase();

  if (ext === ".pdf") {
    const data = (await fs.readFile(p)).toString("base64");
    return {
      path: p,
      kind: "scan",
      block: { type: "document", source: { type: "base64", media_type: "application/pdf", data } },
    };
  }

  if (ext in IMAGE_TYPES) {
    const data = (await fs.readFile(p)).toString("base64");
    return {
      path: p,
      kind: "scan",
      block: { type: "image", source: { type: "base64", media_type: IMAGE_TYPES[ext], data } },
    };
  }

  if (ext === ".docx") {
    // convertToMarkdown exists at runtime but is missing from mammoth's types.
    const md = mammoth as unknown as { convertToMarkdown: typeof mammoth.convertToHtml };
    const { value } = await md.convertToMarkdown({ path: p });
    return { path: p, kind: "document", block: { type: "text", text: value }, verbatimBody: value };
  }

  if (ext === ".pptx") {
    const value = await pptxToMarkdown(p);
    return { path: p, kind: "document", block: { type: "text", text: value }, verbatimBody: value };
  }

  if (ext === ".md") {
    const { data, body } = await readNote(p);
    return {
      path: p,
      kind: "text",
      block: { type: "text", text: body },
      verbatimBody: body,
      existingFrontmatter: data,
    };
  }

  if (ext === ".txt") {
    const text = await fs.readFile(p, "utf8");
    return { path: p, kind: "text", block: { type: "text", text }, verbatimBody: text };
  }

  return null; // unsupported: .heic, .pptx, etc. Caller warns.
}
