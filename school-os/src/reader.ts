// Turns a file from the inbox into something Claude can read.
// Scans (PDF, JPG, PNG) go as documents/images so Claude reads the handwriting.
// Word files and text go as plain text.
import fs from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import { MAX_SCAN_PAGES } from "./config.js";
import type Anthropic from "@anthropic-ai/sdk";
import { readNote } from "./vault.js";

export type SourceKind = "scan" | "document" | "text";

export type Source = {
  path: string;
  kind: SourceKind;
  /** Page count for PDFs. */
  pages?: number;
  /** Set when the file should not be sent to Claude at all, with the reason. */
  refuse?: string;
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

async function pdfTextLayer(bytes: Buffer): Promise<{ markdown: string; chars: number; pages: number } | null> {
  try {
    const parser = new PDFParse({ data: bytes });
    const result = await parser.getText();
    await parser.destroy?.();
    // pdf-parse separates pages with "-- N of M --" lines; turn them into headings.
    const markdown = result.text
      .replace(/^-- (\d+) of \d+ --$/gm, (_m, n) => `\n## Page ${n}\n`)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return { markdown, chars: markdown.replace(/\s+/g, "").length, pages: result.total || 1 };
  } catch {
    return null;
  }
}

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
    const bytes = await fs.readFile(p);
    // Typed PDFs (anything a teacher exported from Word, Slides, a textbook) carry a text
    // layer. Reading it locally is free; sending pages as images and asking Claude to
    // type them back out is the single most expensive thing this system can do.
    const text = await pdfTextLayer(bytes);
    if (text && text.chars / text.pages >= 60) {
      return {
        path: p,
        kind: "document",
        pages: text.pages,
        block: { type: "text", text: text.markdown },
        verbatimBody: text.markdown,
      };
    }
    // No usable text layer: a scan. Vision is worth it, but not for a 40-page one.
    const pages = text?.pages ?? 0;
    if (pages > MAX_SCAN_PAGES) {
      return {
        path: p, kind: "scan", pages,
        block: { type: "text", text: "" },
        refuse: `${pages} scanned pages; over MAX_SCAN_PAGES (${MAX_SCAN_PAGES}). Split it, or raise the limit in .env.`,
      };
    }
    return {
      path: p,
      kind: "scan",
      pages,
      block: { type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } },
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
